<template>
  <div>
    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <h2 class="subtitle-1 font-weight-medium">Turnos (Admin)</h2>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-end">
        <v-btn color="primary" class="mr-2" @click="cargar">Refrescar</v-btn>
        <v-btn color="success" @click="dialogCrear = true">Crear turno</v-btn>
      </v-col>
    </v-row>

    <v-row class="mb-4">
      <v-col cols="12" md="3"
        ><v-text-field v-model="fdesde" type="date" label="Desde" dense
      /></v-col>
      <v-col cols="12" md="3"
        ><v-text-field v-model="fhasta" type="date" label="Hasta" dense
      /></v-col>
      <v-col cols="12" md="3" class="d-flex align-center">
        <v-btn color="primary" @click="cargar">Filtrar</v-btn>
      </v-col>
      <v-col cols="12" md="3" class="d-flex justify-end">
        <v-btn color="secondary" @click="dialogMasivo = true"
          >Alta masiva</v-btn
        >
      </v-col>
    </v-row>

    <v-data-table
      :headers="encabezados"
      :items="turnos"
      :loading="cargando"
      item-key="id"
    >
      <template v-slot:[`item.inicio`]="{ item }">{{
        formatearFechaHora(item.start_time)
      }}</template>
      <template v-slot:[`item.fin`]="{ item }">{{
        formatearFechaHora(item.end_time)
      }}</template>
      <template v-slot:[`item.cupo`]="{ item }">
        <v-chip small>{{ item.remaining }} / {{ item.capacity }}</v-chip>
      </template>
      <template v-slot:[`item.acciones`]="{ item }">
        <v-btn icon @click="borrar(item)"
          ><v-icon color="error">delete</v-icon></v-btn
        >
      </template>
      <template v-slot:no-data>
        <div class="pa-6 text-center grey--text">
          No hay turnos para el filtro.
        </div>
      </template>
    </v-data-table>

    <!-- Diálogo crear turno -->
    <v-dialog v-model="dialogCrear" max-width="520">
      <v-card>
        <v-card-title>Crear turno</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="nuevo.inicio"
            type="datetime-local"
            label="Inicio"
            dense
          />
          <v-text-field
            v-model="nuevo.fin"
            type="datetime-local"
            label="Fin"
            dense
          />
          <v-text-field
            v-model.number="nuevo.capacidad"
            type="number"
            label="Capacidad"
            dense
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogCrear = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="guardando" @click="crear"
            >Crear</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo alta masiva -->
    <v-dialog v-model="dialogMasivo" max-width="640">
      <v-card>
        <v-card-title>Alta masiva</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="masivo.desde"
            type="date"
            label="Desde"
            dense
          />
          <v-text-field
            v-model="masivo.hasta"
            type="date"
            label="Hasta"
            dense
          />
          <v-select
            :items="diasSemana"
            v-model="masivo.dias"
            label="Días"
            chips
            multiple
            dense
          />
          <v-text-field
            v-model="masivo.horaInicio"
            type="time"
            label="Hora inicio"
            dense
          />
          <v-text-field
            v-model="masivo.horaFin"
            type="time"
            label="Hora fin"
            dense
          />
          <v-text-field
            v-model.number="masivo.duracion"
            type="number"
            label="Duración (min)"
            dense
          />
          <v-text-field
            v-model.number="masivo.capacidad"
            type="number"
            label="Capacidad"
            dense
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogMasivo = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="guardandoMasivo" @click="crearMasivo"
            >Crear</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useApi } from "../composables/useApi";
import { formatearFechaHora } from "../composables/useFecha";
import { useNotify } from "../composables/useNotify";

const { crearTurno, eliminarTurno, crearTurnosEnBloque, baseApi } = useApi();
const { confirmAction, toast } = useNotify();

const fdesde = ref(new Date().toISOString().slice(0, 10));
const fhasta = ref(
  new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
);
const turnos = ref([]);
const cargando = ref(false);
const dialogCrear = ref(false);
const dialogMasivo = ref(false);
const guardando = ref(false);
const guardandoMasivo = ref(false);

const nuevo = ref({ inicio: "", fin: "", capacidad: 1 });
const masivo = ref({
  desde: fdesde.value,
  hasta: fhasta.value,
  dias: [1, 2, 3, 4, 5],
  horaInicio: "08:00",
  horaFin: "20:00",
  duracion: 60,
  capacidad: 5,
});

const encabezados = [
  { text: "Inicio", value: "inicio" },
  { text: "Fin", value: "fin" },
  { text: "Cupo", value: "cupo" },
  { text: "Acciones", value: "acciones", sortable: false, align: "end" },
];

async function cargar() {
  cargando.value = true;
  try {
    const q = `?from=${encodeURIComponent(
      fdesde.value
    )}&to=${encodeURIComponent(
      fhasta.value
    )}&tz_offset=${new Date().getTimezoneOffset()}`;
    const r = await fetch(baseApi + "/slots" + q);
    turnos.value = await r.json();
  } finally {
    cargando.value = false;
  }
}

async function crear() {
  guardando.value = true;
  try {
    const body = {
      start: nuevo.value.inicio,
      end: nuevo.value.fin,
      capacity: nuevo.value.capacidad,
    };
    const r = await crearTurno(body);
    if (r?.error) return toast(r.error || "Error al crear", "error");
    dialogCrear.value = false;
    toast("Turno creado", "success");
    await cargar();
  } finally {
    guardando.value = false;
  }
}

async function borrar(item) {
  const ok = await confirmAction({
    title: "Eliminar turno",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    confirmButtonText: "Eliminar",
  });
  if (!ok) return;
  const r = await eliminarTurno(item.id);
  if (r?.error) return toast(r.error || "No se pudo eliminar", "error");
  toast("Turno eliminado", "success");
  await cargar();
}

async function crearMasivo() {
  guardandoMasivo.value = true;
  try {
    const payload = {
      start_date: masivo.value.desde,
      end_date: masivo.value.hasta,
      weekdays: masivo.value.dias,
      time_start: masivo.value.horaInicio,
      time_end: masivo.value.horaFin,
      slot_minutes: masivo.value.duracion,
      capacity: masivo.value.capacidad,
    };
    const r = await crearTurnosEnBloque(payload);
    if (r?.error) return toast(r.error || "Error en alta masiva", "error");
    dialogMasivo.value = false;
    toast("Turnos creados", "success");
    await cargar();
  } finally {
    guardandoMasivo.value = false;
  }
}

cargar();
</script>
