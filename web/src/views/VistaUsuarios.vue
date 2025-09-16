<template>
  <div>
    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <h2 class="subtitle-1 font-weight-medium">Usuarios</h2>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-end">
        <v-btn color="primary" class="mr-2" @click="cargar">Refrescar</v-btn>
        <v-btn color="success" @click="abrirNuevo">Nuevo</v-btn>
      </v-col>
    </v-row>

    <v-data-table
      :headers="encabezados"
      :items="usuarios"
      :loading="cargando"
      item-key="id"
    >
      <template v-slot:[`item.acciones`]="{ item }">
        <v-btn icon @click="editar(item)"><v-icon>edit</v-icon></v-btn>
        <v-btn icon @click="borrar(item)"
          ><v-icon color="error">delete</v-icon></v-btn
        >
      </template>
      <template v-slot:no-data>
        <div class="pa-6 text-center grey--text">No hay usuarios.</div>
      </template>
    </v-data-table>

    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title>{{
          form.id ? "Editar usuario" : "Nuevo usuario"
        }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Nombre" dense />
          <v-text-field v-model="form.email" label="Email" dense />
          <v-select :items="roles" v-model="form.role" label="Rol" dense />
          <v-text-field
            v-model="form.password"
            :type="mostrarPass ? 'text' : 'password'"
            label="Contraseña"
            dense
          />
          <v-checkbox v-model="mostrarPass" label="Mostrar contraseña" dense />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="guardando" @click="guardar"
            >Guardar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useApi } from "../composables/useApi";
import { useNotify } from "../composables/useNotify";

const { obtenerUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario } =
  useApi();
const { confirmAction, toast } = useNotify();

const usuarios = ref([]);
const cargando = ref(false);
const dialog = ref(false);
const guardando = ref(false);
const mostrarPass = ref(false);
const form = ref({ id: null, name: "", email: "", role: "user", password: "" });

const encabezados = [
  { text: "ID", value: "id", width: 80 },
  { text: "Nombre", value: "name" },
  { text: "Email", value: "email" },
  { text: "Rol", value: "role" },
  { text: "Acciones", value: "acciones", sortable: false, align: "end" },
];

const roles = [
  { text: "Usuario", value: "user" },
  { text: "Admin", value: "admin" },
];

function abrirNuevo() {
  form.value = { id: null, name: "", email: "", role: "user", password: "" };
  mostrarPass.value = false;
  dialog.value = true;
}

function editar(item) {
  form.value = {
    id: item.id,
    name: item.name,
    email: item.email,
    role: item.role,
    password: "",
  };
  mostrarPass.value = false;
  dialog.value = true;
}

async function guardar() {
  guardando.value = true;
  try {
    if (form.value.id) {
      const payload = {
        name: form.value.name,
        email: form.value.email,
        role: form.value.role,
      };
      if (form.value.password) payload.password = form.value.password;
      const r = await actualizarUsuario(form.value.id, payload);
      if (r?.error) return toast(r.error, "error");
    } else {
      const r = await crearUsuario({
        name: form.value.name,
        email: form.value.email,
        role: form.value.role,
        password: form.value.password,
      });
      if (r?.error) return toast(r.error, "error");
    }
    dialog.value = false;
    toast("Usuario guardado", "success");
    await cargar();
  } finally {
    guardando.value = false;
  }
}

async function borrar(item) {
  const ok = await confirmAction({
    title: "Eliminar usuario",
    text: `¿Eliminar a ${item.name}?`,
    icon: "warning",
    confirmButtonText: "Eliminar",
  });
  if (!ok) return;
  const r = await eliminarUsuario(item.id);
  if (r?.error) return toast(r.error, "error");
  toast("Usuario eliminado", "success");
  await cargar();
}

async function cargar() {
  cargando.value = true;
  try {
    usuarios.value = await obtenerUsuarios();
  } finally {
    cargando.value = false;
  }
}

cargar();
</script>
