<template>
  <v-app>
    <v-app-bar app color="primary" dark>
      <v-toolbar-title>Vibe Turnos</v-toolbar-title>
      <v-spacer />
      <template v-if="usuario">
        <router-link class="mr-2" to="/turnos"
          ><v-btn text>Turnos</v-btn></router-link
        >
        <router-link class="mr-2" to="/mis-reservas"
          ><v-btn text>Mis reservas</v-btn></router-link
        >
        <template v-if="usuario.role === 'admin'">
          <router-link class="mr-2" to="/admin"
            ><v-btn text>Admin</v-btn></router-link
          >
          <router-link class="mr-2" to="/agenda-admin"
            ><v-btn text>Agenda Admin</v-btn></router-link
          >
          <router-link class="mr-2" to="/pagos"
            ><v-btn text>Pagos</v-btn></router-link
          >
          <router-link class="mr-2" to="/usuarios"
            ><v-btn text>Gestión de usuarios</v-btn></router-link
          >
        </template>
        <v-btn text @click="cerrarSesion">Salir</v-btn>
      </template>
    </v-app-bar>

    <v-main>
      <v-container>
        <div v-if="!usuario">
          <TarjetaLogin @logueado="alLoguear" />
        </div>
        <div v-else>
          <router-view />
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref } from "vue";
import TarjetaLogin from "./components/TarjetaLogin.vue";

const usuario = ref(JSON.parse(localStorage.getItem("user") || "null"));

function alLoguear(datos) {
  localStorage.setItem("token", datos.token);
  localStorage.setItem("user", JSON.stringify(datos.user));
  usuario.value = datos.user;
}

function cerrarSesion() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  usuario.value = null;
}
</script>

<style>
html,
body,
#app {
  height: 100%;
}
</style>
