<template>
  <div>
    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <h2 class="subtitle-1 font-weight-medium">Pagos</h2>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-end">
        <v-text-field
          v-model.number="anio"
          type="number"
          label="Año"
          dense
          style="max-width: 120px"
          class="mr-2"
        />
        <v-select
          :items="meses"
          v-model.number="mes"
          label="Mes"
          dense
          style="max-width: 160px"
          class="mr-2"
        />
        <v-btn color="primary" class="mr-2" @click="cargar">Ver</v-btn>
      </v-col>
    </v-row>

    <v-row class="mb-2">
      <v-col cols="12" md="8">
        <v-alert type="info" outlined dense>
          Seleccione la fecha límite de pago del mes. Si llega la fecha y un
          usuario no está marcado como pagado, no podrá reservar turnos para ese
          mes.
        </v-alert>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-end align-center">
        <v-text-field
          v-model="deadline"
          type="date"
          label="Fecha límite"
          dense
          style="max-width: 200px"
          class="mr-2"
        />
        <v-btn color="secondary" @click="guardarFechaLimite"
          >Guardar límite</v-btn
        >
      </v-col>
    </v-row>

    <v-data-table
      :headers="encabezados"
      :items="filas"
      :loading="cargando"
      item-key="user_id"
    >
      <template v-slot:[`item.estado`]="{ item }">
        <v-chip :color="item.paid ? 'green' : 'grey'" dark small>{{
          item.paid ? "Pagado" : "Pendiente"
        }}</v-chip>
      </template>
      <template v-slot:[`item.acciones`]="{ item }">
        <v-btn
          small
          :color="item.paid ? 'warning' : 'success'"
          @click="togglePago(item)"
        >
          {{ item.paid ? "Marcar pendiente" : "Marcar pagado" }}
        </v-btn>
      </template>
      <template v-slot:no-data>
        <div class="pa-6 text-center grey--text">
          No hay datos para el período.
        </div>
      </template>
    </v-data-table>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useApi } from "../composables/useApi";

const {
  marcarPago,
  baseApi,
  obtenerUsuarios,
  obtenerPagos,
  obtenerDeadline,
  guardarDeadline,
} = useApi();

const hoy = new Date();
const anio = ref(hoy.getFullYear());
const mes = ref(hoy.getMonth() + 1);
const cargando = ref(false);
const filas = ref([]);
const deadline = ref("");

const meses = [
  { text: "Enero", value: 1 },
  { text: "Febrero", value: 2 },
  { text: "Marzo", value: 3 },
  { text: "Abril", value: 4 },
  { text: "Mayo", value: 5 },
  { text: "Junio", value: 6 },
  { text: "Julio", value: 7 },
  { text: "Agosto", value: 8 },
  { text: "Septiembre", value: 9 },
  { text: "Octubre", value: 10 },
  { text: "Noviembre", value: 11 },
  { text: "Diciembre", value: 12 },
];

const encabezados = [
  { text: "Usuario", value: "name" },
  { text: "Email", value: "email" },
  { text: "Estado", value: "estado" },
  { text: "Acciones", value: "acciones", sortable: false, align: "end" },
];

async function cargar() {
  cargando.value = true;
  try {
    const [listaUsuarios, pagosRes, deadlineRes] = await Promise.all([
      obtenerUsuarios(),
      obtenerPagos(anio.value, mes.value),
      obtenerDeadline(anio.value, mes.value),
    ]);
    const mapaPagos = new Map(pagosRes.map((p) => [p.user_id, p]));
    filas.value = listaUsuarios.map((u) => ({
      user_id: u.id,
      name: u.name,
      email: u.email,
      paid: mapaPagos.get(u.id)?.paid || false,
    }));
    deadline.value = deadlineRes?.deadline
      ? String(deadlineRes.deadline).slice(0, 10)
      : "";
  } finally {
    cargando.value = false;
  }
}

async function togglePago(item) {
  const nuevo = !item.paid;
  await marcarPago(String(item.user_id), anio.value, mes.value, nuevo);
  item.paid = nuevo;
}

async function guardarFechaLimite() {
  if (!deadline.value) {
    alert("Seleccione una fecha límite válida");
    return;
  }
  try {
    await guardarDeadline(anio.value, mes.value, deadline.value);
    alert("Fecha límite guardada");
  } catch (e) {
    alert("No se pudo guardar la fecha límite");
  }
}

cargar();
</script>
