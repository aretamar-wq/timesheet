import ExcelJS from 'exceljs';
import { aHorasMinutos } from '../dominio/duracion.js';
import { aDateUtc, aDiaMesAnio } from '../dominio/fechas.js';
import type { ResultadoReporte } from '../servicios/reporteService.js';

/** Exportación del reporte de horas a Excel (.xlsx) y a texto delimitado por punto y coma. */

const TITULOS = ['Proyecto', 'Categoría', 'Tarea', 'GLPI', 'Usuario', 'Fecha', 'Duración'];
const COLUMNA_DURACION = 7;
const SEPARADOR_TXT = ';';
const MARINO = 'FF002C65';

/**
 * Libro de Excel con título, descripción del filtro, encabezado, filas y total. La duración se guarda como
 * tiempo de Excel con formato [h]:mm, así se puede sumar y filtrar en Excel. Los textos se escriben como texto
 * (ExcelJS no los convierte a número ni fecha).
 */
export async function aExcel(resultado: ResultadoReporte, descripcionFiltro: string): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Horas');

  const titulo = hoja.getCell(1, 1);
  titulo.value = 'Reporte de horas';
  titulo.font = { bold: true, size: 14, color: { argb: MARINO } };
  hoja.getCell(2, 1).value = descripcionFiltro;

  const filaTitulos = 4;
  TITULOS.forEach((t, i) => {
    const celda = hoja.getCell(filaTitulos, i + 1);
    celda.value = t;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARINO } };
  });

  let fila = filaTitulos + 1;
  for (const r of resultado.filas) {
    const f = hoja.getRow(fila);
    f.getCell(1).value = r.proyecto;
    f.getCell(2).value = r.categoria;
    f.getCell(3).value = r.tarea ?? '';
    if (r.glpi !== null) f.getCell(4).value = r.glpi;
    f.getCell(5).value = r.usuario;
    f.getCell(6).value = aDateUtc(r.fecha);
    f.getCell(6).numFmt = 'dd/mm/yyyy';
    f.getCell(COLUMNA_DURACION).value = r.duracion / 24;   // días (formato tiempo de Excel)
    f.getCell(COLUMNA_DURACION).numFmt = '[h]:mm';
    fila++;
  }
  const ultimaFila = fila - 1;
  const hayFilas = resultado.filas.length > 0;

  if (hayFilas) {
    hoja.autoFilter = { from: { row: filaTitulos, column: 1 }, to: { row: ultimaFila, column: TITULOS.length } };
  }

  // Fila de total: fórmula, así se recalcula si el usuario filtra o edita en Excel.
  const total = hoja.getRow(fila);
  total.getCell(1).value = 'Total';
  total.getCell(COLUMNA_DURACION).value = hayFilas
    ? { formula: `SUM(G${filaTitulos + 1}:G${ultimaFila})`, result: resultado.totalHoras / 24 }
    : 0;
  total.getCell(COLUMNA_DURACION).numFmt = '[h]:mm';
  for (let c = 1; c <= TITULOS.length; c++) {
    total.getCell(c).font = { bold: true };
    total.getCell(c).border = { top: { style: 'thin' } };
  }

  hoja.views = [{ state: 'frozen', ySplit: filaTitulos }];
  ajustarAnchos(hoja, resultado);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Ancho de cada columna según su contenido más largo (ExcelJS no tiene autoajuste). */
function ajustarAnchos(hoja: ExcelJS.Worksheet, resultado: ResultadoReporte): void {
  const largos = TITULOS.map((t) => t.length);
  for (const r of resultado.filas) {
    const valores = [r.proyecto, r.categoria, r.tarea ?? '', String(r.glpi ?? ''), r.usuario, '00/00/0000', '000:00'];
    valores.forEach((v, i) => (largos[i] = Math.max(largos[i], v.length)));
  }
  largos.forEach((largo, i) => {
    hoja.getColumn(i + 1).width = Math.min(Math.max(largo + 2, i === 0 ? 12 : 8), 60);
  });
}

/**
 * Texto delimitado por punto y coma (el separador de listas de Excel en español), UTF-8 con BOM para que
 * Excel muestre bien las tildes. Primera línea: encabezado; última: total. Duración en formato H:MM.
 */
export function aTexto(resultado: ResultadoReporte): Buffer {
  const lineas = [TITULOS.join(SEPARADOR_TXT)];
  for (const r of resultado.filas) {
    const campos = [
      r.proyecto,
      r.categoria,
      r.tarea,
      r.glpi === null ? null : String(r.glpi),
      r.usuario,
      aDiaMesAnio(r.fecha),
      aHorasMinutos(r.duracion),
    ];
    lineas.push(campos.map(campoTxt).join(SEPARADOR_TXT));
  }
  lineas.push(['Total', '', '', '', '', '', aHorasMinutos(resultado.totalHoras)].join(SEPARADOR_TXT));

  return Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8');
}

/**
 * Campo del TXT: si empieza con = + - @ se le antepone un apóstrofo para que Excel no lo ejecute como fórmula
 * (las descripciones de tareas las escriben los usuarios); si contiene el separador, comillas o saltos de línea,
 * va entre comillas.
 */
function campoTxt(valor: string | null): string {
  if (!valor) return '';
  let campo = valor;
  if ('=+-@'.includes(campo[0])) campo = `'${campo}`;
  if (/[;"\r\n]/.test(campo)) campo = `"${campo.replaceAll('"', '""')}"`;
  return campo;
}
