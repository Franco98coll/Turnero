<template>
  <div>
    <v-row class="mb-4">
      <v-col cols="12" md="6">
        <h2 class="subtitle-1 font-weight-medium">Mis reservas</h2>
      </v-col>
      <v-col cols="12" md="6" class="d-flex justify-end">
        <v-btn color="primary" @click="cargar">Refrescar</v-btn>
      </v-col>
    </v-row>

    <v-data-table
      :headers="encabezados"
      :items="reservasOrdenadas"
      :loading="cargando"
      loading-text="Cargando reservas..."
    >
      <template v-slot:[`item.fecha_inicio`]="{ item }">
        {{ formatearFechaHora(item.start_time) }}
      </template>
      <template v-slot:[`item.fecha_fin`]="{ item }">
        {{ formatearFechaHora(item.end_time) }}
      </template>
      <template v-slot:[`item.estado`]="{ item }">
        <v-chip :color="colorEstado(item.status)" dark small>{{
          item.status
        }}</v-chip>
      </template>
      <template v-slot:[`item.acciones`]="{ item }">
        <v-btn
          icon
          :disabled="cancelandoId === item.id || item.status === 'canceled'"
          @click="cancelar(item)"
        >
          <v-icon color="error">cancel</v-icon>
        </v-btn>
      </template>
      <template v-slot:no-data>
        <div class="pa-6 text-center grey--text">
          No tenés reservas próximas.
        </div>
      </template>
    </v-data-table>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useApi } from "../composables/useApi";
import { formatearFechaHora } from "../composables/useFecha";

const { obtenerReservas, cancelarReserva } = useApi();

const reservas = ref([]);
const cargando = ref(false);
const cancelandoId = ref(null);

const encabezados = [
  { text: "Inicio", value: "fecha_inicio" },
  { text: "Fin", value: "fecha_fin" },
  { text: "Estado", value: "estado" },
  { text: "Acciones", value: "acciones", sortable: false, align: "end" },
];

const reservasOrdenadas = computed(() => {
  const arr = [...reservas.value];
  arr.sort(
    (a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );
  return arr;
});

function colorEstado(s) {
  if (s === "canceled") return "grey";
  if (s === "confirmed") return "green";
  return "blue";
}

async function cargar() {
  cargando.value = true;
  try {
    reservas.value = await obtenerReservas();
  } finally {
    cargando.value = false;
  }
}

async function cancelar(item) {
  if (!confirm("¿Cancelar esta reserva?")) return;
  cancelandoId.value = item.id;
  try {
    await cancelarReserva(item.id);
    await cargar();
  } finally {
    cancelandoId.value = null;
  }
}

cargar();
</script>
