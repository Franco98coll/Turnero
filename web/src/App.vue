<template>
  <v-app>
    <v-navigation-drawer
      v-model="drawerAbierto"
      app
      :mini-variant.sync="mini"
      clipped
    >
      <v-list dense>
        <v-list-item>
          <v-list-item-avatar>
            <template v-if="logoOk">
              <v-img
                src="/logo.png"
                alt="Phoenix Gym"
                max-width="40"
                max-height="40"
                contain
                @error="logoOk = false"
              />
            </template>
            <template v-else>
              <v-icon color="primary">account_circle</v-icon>
            </template>
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title class="font-weight-medium">{{
              usuario?.name || "Invitado"
            }}</v-list-item-title>
            <v-list-item-subtitle>{{
              usuario?.email || ""
            }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-btn icon @click="mini = !mini"
            ><v-icon>chevron_left</v-icon></v-btn
          >
        </v-list-item>
        <v-divider class="my-2" />

        <v-list-item v-if="usuario" to="/turnos" link>
          <v-list-item-icon><v-icon>event</v-icon></v-list-item-icon>
          <v-list-item-title>Turnos</v-list-item-title>
        </v-list-item>
        <v-list-item v-if="usuario" to="/mis-reservas" link>
          <v-list-item-icon><v-icon>bookmark</v-icon></v-list-item-icon>
          <v-list-item-title>Mis reservas</v-list-item-title>
        </v-list-item>
        <template v-if="usuario?.role === 'admin'">
          <v-list-item to="/admin" link>
            <v-list-item-icon><v-icon>build</v-icon></v-list-item-icon>
            <v-list-item-title>Admin</v-list-item-title>
          </v-list-item>
          <v-list-item to="/agenda-admin" link>
            <v-list-item-icon><v-icon>calendar_today</v-icon></v-list-item-icon>
            <v-list-item-title>Agenda Admin</v-list-item-title>
          </v-list-item>
          <v-list-item to="/pagos" link>
            <v-list-item-icon><v-icon>payments</v-icon></v-list-item-icon>
            <v-list-item-title>Pagos</v-list-item-title>
          </v-list-item>
          <v-list-item to="/usuarios" link>
            <v-list-item-icon><v-icon>group</v-icon></v-list-item-icon>
            <v-list-item-title>Usuarios</v-list-item-title>
          </v-list-item>
        </template>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app clipped-left color="primary" dark>
      <v-app-bar-nav-icon @click.stop="drawerAbierto = !drawerAbierto" />
      <v-toolbar-title>Phoenix Gym Turnos</v-toolbar-title>
      <v-spacer />
      <v-text-field
        v-if="usuario"
        dense
        hide-details
        solo-inverted
        flat
        prepend-inner-icon="search"
        label="Buscar"
        style="max-width: 280px"
      />
      <v-btn icon @click="alternarTema"><v-icon>brightness_6</v-icon></v-btn>
      <v-menu v-if="usuario" offset-y>
        <template v-slot:activator="{ on, attrs }">
          <v-btn icon v-bind="attrs" v-on="on"
            ><v-icon>account_circle</v-icon></v-btn
          >
        </template>
        <v-list>
          <v-list-item>
            <v-list-item-content>
              <v-list-item-title>{{ usuario?.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ usuario?.email }}</v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-divider />
          <v-list-item @click="cerrarSesion">
            <v-list-item-icon><v-icon>logout</v-icon></v-list-item-icon>
            <v-list-item-title>Salir</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <div v-if="!usuario">
          <div
            class="d-flex align-center justify-center"
            style="min-height: 60vh"
          >
            <TarjetaLogin @logueado="alLoguear" />
          </div>
        </div>
        <div v-else>
          <router-view />
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, getCurrentInstance } from "vue";
import TarjetaLogin from "./components/TarjetaLogin.vue";

const usuario = ref(JSON.parse(localStorage.getItem("user") || "null"));
const drawerAbierto = ref(true);
const mini = ref(false);
const logoOk = ref(true);

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

const inst = getCurrentInstance();
const vm = inst && inst.proxy;

// Inicializar tema desde localStorage o media query
if (vm && vm.$vuetify && vm.$vuetify.theme) {
  const guardado = localStorage.getItem("tema_oscuro");
  if (guardado === null) {
    const prefiereOscuro =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    vm.$vuetify.theme.dark = !!prefiereOscuro;
  } else {
    vm.$vuetify.theme.dark = guardado === "1";
  }
}

function alternarTema() {
  if (vm && vm.$vuetify && vm.$vuetify.theme) {
    vm.$vuetify.theme.dark = !vm.$vuetify.theme.dark;
    localStorage.setItem("tema_oscuro", vm.$vuetify.theme.dark ? "1" : "0");
  }
}
</script>

<style>
html,
body,
#app {
  height: 100%;
}
</style>
