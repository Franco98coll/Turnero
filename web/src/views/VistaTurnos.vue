<template>
  <div>
    <v-row align="center" class="mb-4">
      <v-col cols="12" md="3">
        <v-text-field v-model="fechaDesde" type="date" dense label="Desde" />
      </v-col>
      <v-col cols="12" md="3">
        <v-text-field v-model="fechaHasta" type="date" dense label="Hasta" />
      </v-col>
      <v-col cols="12" md="3">
        <v-select
          :items="ordenes"
          v-model="ordenSeleccionado"
          dense
          label="Orden"
        />
      </v-col>
      <v-col cols="12" md="3" class="d-flex justify-end">
        <v-btn color="primary" @click="cargarTurnos">Buscar</v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="4" v-for="turno in turnosOrdenados" :key="turno.id">
        <v-card outlined>
          <v-card-title class="d-flex align-center">
            <v-icon small class="mr-2">schedule</v-icon>
            {{ formatearFechaHora(turno.start_time) }}
          </v-card-title>
          <v-card-text>
            <div class="mb-2">
              <v-chip :color="colorDisponibilidad(turno)" dark small>
                {{ turno.remaining }} disponibles / {{ turno.capacity }} cupos
              </v-chip>
            </div>
            <div class="text--secondary">
              Fin: {{ formatearFechaHora(turno.end_time) }}
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="success"
              :disabled="turno.remaining <= 0 || reservando"
              @click="reservar(turno)"
            >
              Reservar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useApi } from "../composables/useApi";
import { formatearFechaHora } from "../composables/useFecha";

const { obtenerTurnos, crearReserva, baseApi } = useApi();

const hoyISO = new Date().toISOString().slice(0, 10);
const fechaDesde = ref(hoyISO);
const fechaHasta = ref(
  new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
);
const turnos = ref([]);
const reservando = ref(false);

const ordenes = [
  { text: "Más próximos", value: "asc" },
  { text: "Más lejanos", value: "desc" },
];
const ordenSeleccionado = ref("asc");

const turnosOrdenados = computed(() => {
  const lista = [...turnos.value];
  lista.sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  if (ordenSeleccionado.value === "desc") lista.reverse();
  return lista;
});

function colorDisponibilidad(t) {
  if (t.remaining <= 0) return "red";
  const ratio = t.remaining / t.capacity;
  if (ratio <= 0.25) return "orange";
  return "green";
}

async function cargarTurnos() {
  const q = `?from=${encodeURIComponent(
    fechaDesde.value
  )}&to=${encodeURIComponent(fechaHasta.value)}`;
  const r = await fetch(baseApi + "/slots" + q);
  turnos.value = await r.json();
}

async function reservar(turno) {
  try {
    reservando.value = true;
    const resp = await crearReserva(turno.id);
    if (resp?.error) return alert(resp.error);
    await cargarTurnos();
  } finally {
    reservando.value = false;
  }
}

// carga inicial
cargarTurnos();
</script>
