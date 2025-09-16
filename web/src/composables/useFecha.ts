// Utilidades de fecha/tiempo con nombres descriptivos

export function rellenar2(numero: number) {
  return String(numero).padStart(2, "0");
}

export function aFecha(valor: any): Date | null {
  const fecha = new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function formatearFecha(valor: any) {
  const fecha = aFecha(valor);
  if (!fecha) return "";
  return `${rellenar2(fecha.getDate())}-${rellenar2(
    fecha.getMonth() + 1
  )}-${fecha.getFullYear()}`;
}

export function formatearFechaHora(valor: any) {
  const fecha = aFecha(valor);
  if (!fecha) return "";
  return `${formatearFecha(fecha)} ${rellenar2(fecha.getHours())}:${rellenar2(
    fecha.getMinutes()
  )}`;
}
