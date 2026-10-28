import { AndFilter, Client, EqualityFilter, InvalidCredentialsError } from 'ldapts';
import { config } from '../config.js';
import { ReglaNegocioError } from '../errores.js';

/** Cuenta de usuario tal como figura en Active Directory. */
export interface UsuarioDirectorio {
  /** sAMAccountName, con las mayúsculas/minúsculas de AD. */
  login: string;
  nombre: string;
  habilitado: boolean;
  dn: string;
}

/** No se pudo contactar al controlador de dominio (o la consulta falló). */
export class DirectorioNoDisponibleError extends Error {}

const ADS_UF_ACCOUNTDISABLE = 0x2;

function crearCliente(): Client {
  return new Client({
    url: config.ad.url,
    timeout: 10_000,
    connectTimeout: 5_000,
    tlsOptions: { rejectUnauthorized: config.ad.tlsVerificar },
  });
}

/** Abre la conexión (con STARTTLS si está configurado), ejecuta fn y la cierra. */
async function conCliente<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = crearCliente();
  try {
    if (config.ad.startTls && config.ad.url.startsWith('ldap://')) {
      await cliente.startTLS({ rejectUnauthorized: config.ad.tlsVerificar });
    }
    return await fn(cliente);
  } finally {
    await cliente.unbind().catch(() => undefined);
  }
}

function esErrorDeConexion(error: unknown): boolean {
  return !(error instanceof InvalidCredentialsError) && !(error instanceof ReglaNegocioError);
}

/** Busca la cuenta por sAMAccountName usando la cuenta de servicio. undefined si no existe. */
async function buscarEntrada(login: string): Promise<UsuarioDirectorio | undefined> {
  if (!config.ad.bindUsuario) {
    throw new ReglaNegocioError(
      'No está configurada la cuenta de servicio para consultar Active Directory (AD_BIND_USUARIO).',
    );
  }
  return conCliente(async (cliente) => {
    await cliente.bind(config.ad.bindUsuario, config.ad.bindPassword);
    const { searchEntries } = await cliente.search(config.ad.baseDn, {
      scope: 'sub',
      filter: new AndFilter({
        filters: [
          new EqualityFilter({ attribute: 'objectCategory', value: 'person' }),
          new EqualityFilter({ attribute: 'objectClass', value: 'user' }),
          new EqualityFilter({ attribute: 'sAMAccountName', value: login }),
        ],
      }),
      attributes: ['sAMAccountName', 'displayName', 'cn', 'userAccountControl'],
      sizeLimit: 1,
    });
    const entrada = searchEntries[0];
    if (!entrada) return undefined;

    const texto = (valor: unknown) => (Array.isArray(valor) ? String(valor[0] ?? '') : String(valor ?? ''));
    const control = Number(texto(entrada.userAccountControl)) || 0;
    return {
      login: texto(entrada.sAMAccountName) || login,
      nombre: texto(entrada.displayName) || texto(entrada.cn),
      habilitado: (control & ADS_UF_ACCOUNTDISABLE) === 0,
      dn: entrada.dn,
    };
  });
}

/**
 * Valida usuario y contraseña de red contra AD. Lanza DirectorioNoDisponibleError si no se puede contactar al
 * controlador de dominio. Con cuenta de servicio configurada, busca el DN del usuario y hace bind con él;
 * si no, hace bind con usuario@dominio.
 */
export async function validarCredenciales(login: string, password: string): Promise<boolean> {
  // Con contraseña vacía AD puede aceptar un bind anónimo: se rechaza antes.
  if (!login.trim() || !password) return false;
  if (config.ad.modo === 'simulado') return true;

  try {
    let dn = `${login}@${config.ad.dominio}`;
    if (config.ad.bindUsuario) {
      const cuenta = await buscarEntrada(login);
      if (!cuenta || !cuenta.habilitado) return false;
      dn = cuenta.dn;
    }
    await conCliente((cliente) => cliente.bind(dn, password));
    return true;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) return false;
    if (esErrorDeConexion(error)) {
      console.error('Error al validar credenciales en AD:', error);
      throw new DirectorioNoDisponibleError();
    }
    throw error;
  }
}

/** Busca la cuenta en AD para el ABM de Usuarios. undefined si no existe; ReglaNegocioError si no se puede consultar. */
export async function buscarUsuario(login: string): Promise<UsuarioDirectorio | undefined> {
  if (!login.trim()) return undefined;
  if (config.ad.modo === 'simulado') {
    return { login: login.trim(), nombre: login.trim(), habilitado: true, dn: '' };
  }
  try {
    return await buscarEntrada(login.trim());
  } catch (error) {
    if (error instanceof ReglaNegocioError) throw error;
    console.error('Error al consultar AD:', error);
    throw new ReglaNegocioError('No se pudo consultar Active Directory. Intente nuevamente en unos minutos.');
  }
}
