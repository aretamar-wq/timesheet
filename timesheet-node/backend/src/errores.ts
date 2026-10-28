/** Violación de una regla de negocio. El mensaje es apto para mostrarle al usuario (la API responde 400). */
export class ReglaNegocioError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ReglaNegocioError';
  }
}

/** Recurso inexistente (la API responde 404). */
export class NoEncontradoError extends Error {
  constructor(mensaje = 'No encontrado.') {
    super(mensaje);
    this.name = 'NoEncontradoError';
  }
}
