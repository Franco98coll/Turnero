// Cliente API modularizado con nombres descriptivos
export interface UsuarioMinimo {
  id: string | number;
  name: string;
  email: string;
  role: string;
}

declare const __API_BASE__: string | undefined;

export function useApi() {
  const baseApi =
    (__API_BASE__ && __API_BASE__ !== ""
      ? __API_BASE__
      : window.location && window.location.origin
      ? window.location.origin
      : "") + "/api";

  let tokenActual = localStorage.getItem("token") || "";

  function encabezadosAutenticacion() {
    return tokenActual
      ? {
          Authorization: "Bearer " + tokenActual,
          "Content-Type": "application/json",
        }
      : { "Content-Type": "application/json" };
  }

  async function iniciarSesion(email: string, password: string) {
    const respuesta = await fetch(baseApi + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!respuesta.ok) throw new Error("Login failed");
    const cuerpo = await respuesta.json();
    tokenActual = cuerpo.token || tokenActual;
    return cuerpo;
  }

  // Usuarios
  const obtenerUsuarios = async () =>
    (
      await fetch(baseApi + "/users", { headers: encabezadosAutenticacion() })
    ).json();
  const crearUsuario = async (usuario: any) =>
    (
      await fetch(baseApi + "/users", {
        method: "POST",
        headers: encabezadosAutenticacion(),
        body: JSON.stringify(usuario),
      })
    ).json();
  const actualizarUsuario = async (id: string | number, datos: any) =>
    (
      await fetch(baseApi + "/users/" + id, {
        method: "PATCH",
        headers: encabezadosAutenticacion(),
        body: JSON.stringify(datos),
      })
    ).json();
  const eliminarUsuario = async (id: string | number) =>
    (
      await fetch(baseApi + "/users/" + id, {
        method: "DELETE",
        headers: encabezadosAutenticacion(),
      })
    ).json();

  // Turnos
  const obtenerTurnos = async (fecha?: string) =>
    (
      await fetch(
        baseApi + "/slots" + (fecha ? `?date=${encodeURIComponent(fecha)}` : "")
      )
    ).json();
  const crearTurno = async (turno: any) =>
    (
      await fetch(baseApi + "/slots", {
        method: "POST",
        headers: encabezadosAutenticacion(),
        body: JSON.stringify({
          start_time: turno.start,
          end_time: turno.end,
          capacity: turno.capacity,
        }),
      })
    ).json();
  const crearTurnosEnBloque = async (parametros: any) =>
    (
      await fetch(baseApi + "/slots/bulk", {
        method: "POST",
        headers: encabezadosAutenticacion(),
        body: JSON.stringify(parametros),
      })
    ).json();
  const eliminarTurno = async (id: string | number) =>
    (
      await fetch(baseApi + "/slots/" + id, {
        method: "DELETE",
        headers: encabezadosAutenticacion(),
      })
    ).json();
  const obtenerAsistentes = async (turnoId: string) =>
    (
      await fetch(baseApi + "/slots/" + turnoId + "/attendees", {
        headers: encabezadosAutenticacion(),
      })
    ).json();

  // Reservas
  const obtenerReservas = async () =>
    (
      await fetch(baseApi + "/bookings", {
        headers: encabezadosAutenticacion(),
      })
    ).json();
  const crearReserva = async (slot_id: number) =>
    (
      await fetch(baseApi + "/bookings", {
        method: "POST",
        headers: encabezadosAutenticacion(),
        body: JSON.stringify({ slot_id }),
      })
    ).json();
  const cancelarReserva = async (id: number) =>
    (
      await fetch(baseApi + "/bookings/" + id, {
        method: "DELETE",
        headers: encabezadosAutenticacion(),
      })
    ).json();

  // Pagos
  const marcarPago = async (
    userId: string,
    year: number,
    month: number,
    paid: boolean
  ) =>
    (
      await fetch(baseApi + "/users/" + userId + "/pay", {
        method: "POST",
        headers: encabezadosAutenticacion(),
        body: JSON.stringify({ year, month, paid }),
      })
    ).json();

  return {
    baseApi,
    get tokenActual() {
      return tokenActual;
    },
    set tokenActual(valor: string) {
      tokenActual = valor;
    },
    encabezadosAutenticacion,
    iniciarSesion,
    obtenerUsuarios,
    crearUsuario,
    actualizarUsuario,
    eliminarUsuario,
    obtenerTurnos,
    crearTurno,
    crearTurnosEnBloque,
    eliminarTurno,
    obtenerAsistentes,
    obtenerReservas,
    crearReserva,
    cancelarReserva,
    marcarPago,
  };
}
