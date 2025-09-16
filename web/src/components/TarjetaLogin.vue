<template>
  <v-card class="mx-auto" max-width="420">
    <v-card-title>Ingreso</v-card-title>
    <v-card-text>
      <v-text-field label="Email" v-model="correoElectronico" />
      <v-text-field label="Contraseña" type="password" v-model="contrasena" />
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn color="primary" :loading="cargando" @click="hacerLogin"
        >Entrar</v-btn
      >
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref } from "vue";
import { useApi } from "../composables/useApi";

const emit = defineEmits(["logueado"]);
const { iniciarSesion } = useApi();

const correoElectronico = ref("");
const contrasena = ref("");
const cargando = ref(false);

async function hacerLogin() {
  try {
    cargando.value = true;
    const respuesta = await iniciarSesion(
      correoElectronico.value,
      contrasena.value
    );
    emit("logueado", respuesta);
  } catch (e) {
    alert("Login inválido");
  } finally {
    cargando.value = false;
  }
}
</script>
