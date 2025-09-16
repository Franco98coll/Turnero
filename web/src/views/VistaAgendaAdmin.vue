<template>
  <div>
    <v-row class="mb-4">
      <v-col cols="12" md="8">
        <h2 class="subtitle-1 font-weight-medium">Agenda</h2>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-end">
        <v-text-field v-model="fecha" type="date" label="Fecha" dense />
        <v-btn color="primary" class="ml-2" @click="cargar">Ver</v-btn>
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
      <template v-slot:[`item.acciones`]="{ item }">
        <v-btn small @click="verAsistentes(item)">Asistentes</v-btn>
      </template>
      <template v-slot:no-data>
        <div class="pa-6 text-center grey--text">
          No hay turnos para la fecha.
        </div>
      </template>
    </v-data-table>

    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title>Asistentes</v-card-title>
        <v-card-text>
          <v-list two-line>
            <v-list-item v-for="a in asistentes" :key="a.booking_id">
              <v-list-item-content>
                <v-list-item-title>{{ a.name }}</v-list-item-title>
                <v-list-item-subtitle>{{ a.email }}</v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
          <div v-if="!asistentes.length" class="grey--text">
            Sin asistentes.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useApi } from "../composables/useApi";
import { formatearFechaHora } from "../composables/useFecha";

const { baseApi } = useApi();

const fecha = ref(new Date().toISOString().slice(0, 10));
const turnos = ref([]);
const cargando = ref(false);
const dialog = ref(false);
const asistentes = ref([]);

const encabezados = [
  { text: "Inicio", value: "inicio" },
  { text: "Fin", value: "fin" },
  { text: "Acciones", value: "acciones", sortable: false, align: "end" },
];

async function cargar() {
  cargando.value = true;
  try {
    const r = await fetch(
      `${baseApi}/slots?date=${encodeURIComponent(fecha.value)}`
    );
    turnos.value = await r.json();
  } finally {
    cargando.value = false;
  }
}

async function verAsistentes(item) {
  const r = await fetch(`${baseApi}/slots/${item.id}/attendees`);
  asistentes.value = await r.json();
  dialog.value = true;
}

cargar();
</script>
