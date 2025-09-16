import Vue from "vue";
import Router from "vue-router";

// Vistas (carga diferida)
const VistaTurnos = () => import("./views/VistaTurnos.vue");
const VistaReservas = () => import("./views/VistaReservas.vue");
const VistaAdmin = () => import("./views/VistaAdmin.vue");
const VistaUsuarios = () => import("./views/VistaUsuarios.vue");
const VistaAgendaAdmin = () => import("./views/VistaAgendaAdmin.vue");
const VistaPagos = () => import("./views/VistaPagos.vue");

Vue.use(Router);

export default new Router({
  mode: "hash",
  routes: [
    { path: "/", redirect: "/turnos" },
    { path: "/turnos", name: "turnos", component: VistaTurnos },
    { path: "/mis-reservas", name: "reservas", component: VistaReservas },
    { path: "/admin", name: "admin", component: VistaAdmin },
    { path: "/usuarios", name: "usuarios", component: VistaUsuarios },
    { path: "/agenda-admin", name: "agendaAdmin", component: VistaAgendaAdmin },
    { path: "/pagos", name: "pagos", component: VistaPagos },
  ],
});
