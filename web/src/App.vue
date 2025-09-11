<template>
  <v-app>
    <v-app-bar app color="primary" dark>
      <v-toolbar-title>Vibe Turnos</v-toolbar-title>
      <v-spacer />
      <div v-if="user">
        <v-btn text @click="view = 'slots'">Turnos</v-btn>
        <v-btn text @click="view = 'bookings'">Mis reservas</v-btn>
        <template v-if="user.role === 'admin'">
          <v-btn text @click="view = 'admin'">Admin</v-btn>
          <v-btn text @click="view = 'adminCalendar'">Agenda Admin</v-btn>
          <v-btn text @click="goPayments()">Pagos</v-btn>
          <v-btn text @click="goUsers()">Gestión de usuarios</v-btn>
        </template>
        <v-btn text @click="logout">Salir</v-btn>
      </div>
    </v-app-bar>

    <v-main>
      <v-container>
        <div v-if="!user">
          <v-card class="mx-auto" max-width="420">
            <v-card-title>Ingreso</v-card-title>
            <v-card-text>
              <v-text-field label="Email" v-model="login.email" />
              <v-text-field
                label="Contraseña"
                type="password"
                v-model="login.password"
              />
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" @click="doLogin">Entrar</v-btn>
            </v-card-actions>
          </v-card>
        </div>

        <!-- Agenda Admin: calendario de los turnos -->
        <div v-else-if="view === 'adminCalendar' && user.role === 'admin'">
          <h3 class="mt-8">Agenda de turnos</h3>
          <v-row class="mb-2" align="center">
            <v-col cols="12" md="3">
              <v-text-field
                dense
                type="date"
                label="Desde"
                v-model="range.from"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field
                dense
                type="date"
                label="Hasta"
                v-model="range.to"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                dense
                :items="viewModes"
                label="Vista"
                v-model="calendarView"
              />
            </v-col>
            <v-col cols="12" md="3" class="d-flex justify-end">
              <v-btn color="primary" @click="loadSlots">Actualizar</v-btn>
            </v-col>
          </v-row>
          <v-sheet height="650">
            <v-calendar
              :now="today"
              :weekdays="[1, 2, 3, 4, 5, 6, 0]"
              :type="calendarView"
              :events="events"
              :event-color="getEventColor"
              @click:event="({ event }) => openAttendees(event.raw)"
            />
          </v-sheet>
        </div>

        <!-- Pagos: administración de cuotas -->
        <div v-else-if="view === 'payments' && user.role === 'admin'">
          <h3>Pagos</h3>
          <v-data-table
            :headers="paymentsHeaders"
            :items="users"
            :items-per-page="10"
          >
            <template v-slot:[`item.payment_due_date`]="{ item }">
              <v-text-field
                dense
                type="date"
                v-model="item.payment_due_date"
                @blur="savePaymentDue(item)"
              />
            </template>
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn
                x-small
                class="mr-2"
                @click="
                  markPaid(
                    item,
                    new Date().getFullYear(),
                    new Date().getMonth() + 1,
                    true
                  )
                "
                >Marcar pago</v-btn
              >
              <v-btn
                x-small
                color="error"
                @click="
                  markPaid(
                    item,
                    new Date().getFullYear(),
                    new Date().getMonth() + 1,
                    false
                  )
                "
                >Quitar pago</v-btn
              >
            </template>
          </v-data-table>
        </div>

        <div v-else-if="view === 'slots'">
          <v-row class="mb-2" align="center">
            <v-col cols="12" md="3">
              <v-text-field
                dense
                label="Desde"
                type="date"
                v-model="range.from"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field
                dense
                label="Hasta"
                type="date"
                v-model="range.to"
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                dense
                :items="viewModes"
                label="Vista"
                v-model="calendarView"
              />
            </v-col>
            <v-col cols="12" md="3" class="d-flex justify-end">
              <v-btn color="primary" @click="loadSlots">Actualizar</v-btn>
            </v-col>
          </v-row>

          <v-sheet height="650">
            <v-calendar
              ref="cal"
              :now="today"
              :weekdays="[1, 2, 3, 4, 5, 6, 0]"
              :type="calendarView"
              :events="events"
              :event-color="getEventColor"
              color="primary"
              @click:event="onClickEvent"
            />
          </v-sheet>

          <v-row class="mt-2" dense>
            <v-col cols="12" md="6">
              <v-chip x-small color="green" dark class="mr-2" />
              <span>Con buena disponibilidad</span>
              <v-chip x-small color="orange" dark class="ml-4 mr-2" />
              <span>Pocos lugares</span>
              <v-chip x-small color="red" dark class="ml-4 mr-2" />
              <span>Sin lugares</span>
            </v-col>
          </v-row>

          <v-dialog v-model="dialog" max-width="420">
            <v-card>
              <v-card-title class="headline">Confirmar reserva</v-card-title>
              <v-card-text>
                <div v-if="selected">
                  <div>
                    <strong>Inicio:</strong>
                    {{
                      fmtDateTime(selected.start_local || selected.start_time)
                    }}
                  </div>
                  <div>
                    <strong>Fin:</strong>
                    {{ fmtDateTime(selected.end_local || selected.end_time) }}
                  </div>
                  <div>
                    <strong>Disponibles:</strong> {{ selected.remaining }}
                  </div>
                </div>
              </v-card-text>
              <v-card-actions>
                <v-spacer />
                <v-btn text @click="dialog = false">Cancelar</v-btn>
                <v-btn
                  color="primary"
                  :disabled="!selected || selected.remaining <= 0"
                  @click="confirmBooking"
                  >Reservar</v-btn
                >
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>

        <div v-else-if="view === 'bookings'">
          <v-data-table
            :headers="bookingHeaders"
            :items="bookings"
            :items-per-page="10"
          >
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn small color="error" @click="cancelBooking(item)"
                >Cancelar</v-btn
              >
            </template>
            <template v-slot:[`item.start_time`]="{ item }">{{
              fmtDateTime(item.start_time)
            }}</template>
            <template v-slot:[`item.end_time`]="{ item }">{{
              fmtDateTime(item.end_time)
            }}</template>
          </v-data-table>
        </div>

        <div v-else-if="view === 'admin' && user.role === 'admin'">
          <h3 class="mt-8">Configuración de Turnos</h3>
          <v-row>
            <v-col cols="12" md="4"
              ><v-text-field
                dense
                type="datetime-local"
                label="Inicio"
                v-model="slotForm.start"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field
                dense
                type="datetime-local"
                label="Fin"
                v-model="slotForm.end"
            /></v-col>
            <v-col cols="12" md="2"
              ><v-text-field
                dense
                label="Cupo"
                type="number"
                v-model.number="slotForm.capacity"
            /></v-col>
            <v-col cols="12" md="2"
              ><v-btn color="primary" @click="createSlot">Agregar</v-btn></v-col
            >
          </v-row>

          <h4 class="mt-8">Crear por agenda semanal</h4>
          <v-row>
            <v-col cols="12" md="3"
              ><v-text-field
                dense
                type="date"
                label="Desde"
                v-model="bulk.start_date"
            /></v-col>
            <v-col cols="12" md="3"
              ><v-text-field
                dense
                type="date"
                label="Hasta"
                v-model="bulk.end_date"
            /></v-col>
            <v-col cols="12" md="6"
              ><v-select
                dense
                multiple
                chips
                label="Días de semana"
                :items="weekdayItems"
                v-model="bulk.weekdays"
            /></v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="3"
              ><v-text-field
                dense
                type="time"
                label="Hora inicio"
                v-model="bulk.time_start"
            /></v-col>
            <v-col cols="12" md="3"
              ><v-text-field
                dense
                type="time"
                label="Hora fin"
                v-model="bulk.time_end"
            /></v-col>
            <v-col cols="12" md="3"
              ><v-text-field
                dense
                type="number"
                label="Duración (min)"
                v-model.number="bulk.slot_minutes"
            /></v-col>
            <v-col cols="12" md="3"
              ><v-text-field
                dense
                type="number"
                label="Cupo"
                v-model.number="bulk.capacity"
            /></v-col>
          </v-row>
          <v-row>
            <v-col cols="12" class="d-flex justify-end">
              <v-btn outlined color="error" class="mr-2" @click="deleteAllSlots"
                >Eliminar todos</v-btn
              >
              <v-btn color="primary" @click="createBulk">Crear turnos</v-btn>
            </v-col>
          </v-row>

          <v-data-table
            :headers="slotAdminHeaders"
            :items="slots"
            :items-per-page="10"
          >
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn icon small class="mr-1" @click="openAttendees(item)">
                <span class="material-icons">group</span>
              </v-btn>
              <v-btn icon small color="error" @click="deleteSlot(item)"
                ><span class="material-icons">delete</span></v-btn
              >
            </template>
            <template v-slot:[`item.start_time`]="{ item }">{{
              fmtDateTime(item.start_time)
            }}</template>
            <template v-slot:[`item.end_time`]="{ item }">{{
              fmtDateTime(item.end_time)
            }}</template>
          </v-data-table>
        </div>

        <!-- Gestión de usuarios -->
        <div v-else-if="view === 'users' && user.role === 'admin'">
          <h3>Gestión de usuarios</h3>
          <v-card class="mb-4">
            <v-card-text>
              <v-row>
                <v-col cols="12" md="3"
                  ><v-text-field dense label="Nombre" v-model="newUser.name"
                /></v-col>
                <v-col cols="12" md="3"
                  ><v-text-field dense label="Email" v-model="newUser.email"
                /></v-col>
                <v-col cols="12" md="3"
                  ><v-text-field
                    dense
                    label="Password"
                    type="password"
                    v-model="newUser.password"
                /></v-col>
                <v-col cols="12" md="2"
                  ><v-select
                    dense
                    :items="['user', 'admin']"
                    label="Rol"
                    v-model="newUser.role"
                /></v-col>
                <v-col cols="12" md="1" class="d-flex align-center"
                  ><v-btn color="primary" @click="createUser"
                    >Crear</v-btn
                  ></v-col
                >
              </v-row>
            </v-card-text>
          </v-card>

          <v-data-table
            :headers="userTableHeaders"
            :items="users"
            :items-per-page="10"
          >
            <template v-slot:[`item.actions`]="{ item }">
              <v-btn icon small @click="openEdit(item)"
                ><span class="material-icons">edit</span></v-btn
              >
              <v-btn icon small color="error" @click="removeUser(item)"
                ><span class="material-icons">delete</span></v-btn
              >
            </template>
            <template v-slot:[`item.created_at`]="{ item }">{{
              fmtDate(item.created_at)
            }}</template>
          </v-data-table>

          <v-dialog v-model="editDialog" max-width="500">
            <v-card>
              <v-card-title>Editar usuario</v-card-title>
              <v-card-text>
                <v-text-field dense label="Nombre" v-model="editUser.name" />
                <v-text-field dense label="Email" v-model="editUser.email" />
                <v-text-field
                  dense
                  label="Password (opcional)"
                  type="password"
                  v-model="editUser.password"
                />
                <v-select
                  dense
                  :items="['user', 'admin']"
                  label="Rol"
                  v-model="editUser.role"
                />
              </v-card-text>
              <v-card-actions>
                <v-spacer />
                <v-btn text @click="editDialog = false">Cancelar</v-btn>
                <v-btn color="primary" @click="saveEdit">Guardar</v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>

        <!-- Diálogo de asistentes (global para Admin y Agenda Admin) -->
        <v-dialog v-model="attDialog" max-width="600">
          <v-card>
            <v-card-title>
              Inscriptos
              <v-spacer></v-spacer>
              <small v-if="attSlot"
                >{{ fmtDateTime(attSlot.start_local || attSlot.start_time) }} ·
                Capacidad {{ attSlot.capacity }}</small
              >
            </v-card-title>
            <v-card-text>
              <v-data-table
                :headers="attHeaders"
                :items="attendees"
                :items-per-page="10"
                dense
              >
                <template v-slot:[`item.created_at`]="{ item }">{{
                  fmtDateTime(item.created_at)
                }}</template>
              </v-data-table>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn text @click="attDialog = false">Cerrar</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-container>
    </v-main>

    <v-snackbar v-model="snackbar" timeout="3000" top right>
      {{ snackbarText }}
      <template v-slot:action="{ attrs }">
        <v-btn text v-bind="attrs" @click="snackbar = false">Cerrar</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";

declare const __API_BASE__: string | undefined;
const api = {
  base:
    (__API_BASE__ && __API_BASE__ !== ""
      ? __API_BASE__
      : window.location && window.location.origin
      ? window.location.origin
      : "") + "/api",
  token: localStorage.getItem("token") || "",
  headers() {
    return this.token
      ? {
          Authorization: "Bearer " + this.token,
          "Content-Type": "application/json",
        }
      : { "Content-Type": "application/json" };
  },
  async login(email: string, password: string) {
    const r = await fetch(this.base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) throw new Error("Login failed");
    return r.json();
  },
  async getUsers() {
    const r = await fetch(this.base + "/users", { headers: this.headers() });
    return r.json();
  },
  async createUser(u: any) {
    const r = await fetch(this.base + "/users", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(u),
    });
    return r.json();
  },
  async updateUser(id: number, u: any) {
    const r = await fetch(this.base + "/users/" + id, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(u),
    });
    return r.json();
  },
  async deleteUser(id: number) {
    const r = await fetch(this.base + "/users/" + id, {
      method: "DELETE",
      headers: this.headers(),
    });
    return r.json();
  },
  async getSlots(date?: string) {
    const r = await fetch(
      this.base + "/slots" + (date ? `?date=${encodeURIComponent(date)}` : "")
    );
    return r.json();
  },
  async createSlot(s: any) {
    const r = await fetch(this.base + "/slots", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        start_time: s.start,
        end_time: s.end,
        capacity: s.capacity,
      }),
    });
    return r.json();
  },
  async createBulk(b: any) {
    const r = await fetch(this.base + "/slots/bulk", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(b),
    });
    return r.json();
  },
  async deleteSlot(id: number) {
    const r = await fetch(this.base + "/slots/" + id, {
      method: "DELETE",
      headers: this.headers(),
    });
    return r.json();
  },
  async getBookings() {
    const r = await fetch(this.base + "/bookings", { headers: this.headers() });
    return r.json();
  },
  async getAttendees(slotId: string) {
    const r = await fetch(this.base + "/slots/" + slotId + "/attendees", {
      headers: this.headers(),
    });
    return r.json();
  },
  async createBooking(slot_id: number) {
    const r = await fetch(this.base + "/bookings", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ slot_id }),
    });
    return r.json();
  },
  async cancelBooking(id: number) {
    const r = await fetch(this.base + "/bookings/" + id, {
      method: "DELETE",
      headers: this.headers(),
    });
    return r.json();
  },
  async markPaid(userId: string, year: number, month: number, paid: boolean) {
    const r = await fetch(this.base + "/users/" + userId + "/pay", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ year, month, paid }),
    });
    return r.json();
  },
};

const user = ref<any>(JSON.parse(localStorage.getItem("user") || "null"));
const view = ref<
  "slots" | "bookings" | "admin" | "users" | "adminCalendar" | "payments"
>("slots");
const login = reactive({ email: "", password: "" });
const date = ref<string>(new Date().toISOString().slice(0, 10));
const range = reactive({
  from: new Date().toISOString().slice(0, 10),
  to: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
});
const slots = ref<any[]>([]);
const bookings = ref<any[]>([]);
const users = ref<any[]>([]);
const userTableHeaders = [
  { text: "ID", value: "id" },
  { text: "Nombre", value: "name" },
  { text: "Email", value: "email" },
  { text: "Rol", value: "role" },
  { text: "Creado", value: "created_at" },
  { text: "", value: "actions", sortable: false },
];
const editDialog = ref(false);
const editUser = reactive<{
  id: number;
  name: string;
  email: string;
  password?: string;
  role: string;
}>({ id: 0, name: "", email: "", role: "user" });
const newUser = reactive({ name: "", email: "", password: "", role: "user" });
const slotForm = reactive({ start: "", end: "", capacity: 1 });
const bulk = reactive({
  start_date: "",
  end_date: "",
  weekdays: [1, 2, 3, 4, 5],
  time_start: "09:00",
  time_end: "18:00",
  slot_minutes: 30,
  capacity: 1,
});

const slotHeaders = [
  { text: "Inicio", value: "start_time" },
  { text: "Fin", value: "end_time" },
  { text: "Cupo", value: "capacity" },
  { text: "Disponible", value: "remaining" },
  { text: "", value: "actions", sortable: false },
];
const slotAdminHeaders = [...slotHeaders];
const attHeaders = [
  { text: "Nombre", value: "name" },
  { text: "Email", value: "email" },
  { text: "Reservado", value: "created_at" },
];
const userHeaders = [
  { text: "ID", value: "id" },
  { text: "Nombre", value: "name" },
  { text: "Email", value: "email" },
  { text: "Rol", value: "role" },
  { text: "Creado", value: "created_at" },
];
const bookingHeaders = [
  { text: "Inicio", value: "start_time" },
  { text: "Fin", value: "end_time" },
  { text: "Estado", value: "status" },
  { text: "", value: "actions", sortable: false },
];
const paymentsHeaders = [
  { text: "Nombre", value: "name" },
  { text: "Email", value: "email" },
  { text: "Fecha pago", value: "payment_due_date" },
  { text: "", value: "actions", sortable: false },
];

const calendarView = ref<"day" | "week" | "month">("week");
const viewModes = [
  { text: "Día", value: "day" },
  { text: "Semana", value: "week" },
  { text: "Mes", value: "month" },
];
const today = new Date().toISOString().slice(0, 10);
const events = ref<any[]>([]);
const dialog = ref(false);
const selected = ref<any | null>(null);
const snackbar = ref(false);
const snackbarText = ref("");
const attDialog = ref(false);
const attendees = ref<any[]>([]);
const attSlot = ref<any | null>(null);

async function doLogin() {
  try {
    const res = await api.login(login.email, login.password);
    api.token = res.token;
    localStorage.setItem("token", res.token);
    localStorage.setItem("user", JSON.stringify(res.user));
    user.value = res.user;
    view.value = "slots";
    loadSlots();
  } catch {
    alert("Login inválido");
  }
}

function logout() {
  localStorage.clear();
  user.value = null;
  (view as any).value = "slots";
}
async function loadSlots() {
  // usar rango si está completo; sino, fallback al día
  let data;
  if (range.from && range.to) {
    const q = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(
      range.to
    )}`;
    const r = await fetch(api.base + "/slots" + q);
    data = await r.json();
  } else {
    data = await api.getSlots(date.value);
  }
  slots.value = data;
  events.value = data.map((s: any) => ({
    name: `Cupo ${s.capacity} · Disp ${s.remaining}`,
    start: new Date(s.start_time),
    end: new Date(s.end_time),
    color:
      s.remaining > 0
        ? s.remaining / s.capacity <= 0.25
          ? "orange"
          : "green"
        : "red",
    timed: true,
    slot_id: s.id,
    raw: s,
  }));
}

function getEventColor(e: any) {
  return e.color;
}
function onClickEvent({ event }: any) {
  selected.value = event.raw;
  dialog.value = true;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDate(val: any): Date | null {
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(val: any) {
  const d = toDate(val);
  if (!d) return "";
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
function fmtDateTime(val: any) {
  const d = toDate(val);
  if (!d) return "";
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function confirmBooking() {
  if (!selected.value) return;
  const r = await api.createBooking(selected.value.id);
  if (r.error) {
    snackbarText.value = r.error;
    snackbar.value = true;
    return;
  }
  dialog.value = false;
  await loadSlots();
  await loadBookings();
}
async function book(item: any) {
  const r = await api.createBooking(item.id);
  if (r.error) return alert(r.error);
  loadSlots();
  loadBookings();
}
async function cancelBooking(item: any) {
  const r = await api.cancelBooking(item.id);
  if (r.error) return alert(r.error);
  loadBookings();
  loadSlots();
}
async function loadBookings() {
  if (!user.value) return;
  const list = await api.getBookings();
  if (user.value.role === "admin") {
    bookings.value = list;
  } else {
    const now = Date.now();
    bookings.value = list.filter(
      (b: any) =>
        b.status !== "canceled" && new Date(b.start_time).getTime() >= now
    );
  }
}
async function createUser() {
  const u = await api.createUser(newUser as any);
  if (u.error) return alert(u.error);
  Object.assign(newUser, { name: "", email: "", password: "", role: "user" });
  loadUsers();
}
function goUsers() {
  view.value = "users";
  loadUsers();
}
function goPayments() {
  view.value = "payments";
  loadUsers();
}
function openEdit(item: any) {
  Object.assign(editUser, {
    id: item.id,
    name: item.name,
    email: item.email,
    role: item.role,
    password: "",
  });
  editDialog.value = true;
}
async function saveEdit() {
  const payload: any = {
    name: editUser.name,
    email: editUser.email,
    role: editUser.role,
  };
  if (editUser.password && editUser.password.trim() !== "")
    payload.password = editUser.password;
  const resp = await api.updateUser(editUser.id, payload);
  if (resp?.error) {
    snackbarText.value = resp.error;
    snackbar.value = true;
    return;
  }
  editDialog.value = false;
  snackbarText.value = "Usuario actualizado";
  snackbar.value = true;
  await loadUsers();
}
async function removeUser(item: any) {
  if (!confirm(`Eliminar usuario ${item.email}?`)) return;
  const resp = await api.deleteUser(item.id);
  if (resp?.error) {
    snackbarText.value = resp.error;
    snackbar.value = true;
    return;
  }
  snackbarText.value = "Usuario eliminado";
  snackbar.value = true;
  await loadUsers();
}
async function loadUsers() {
  if (!user.value || user.value.role !== "admin") return;
  users.value = await api.getUsers();
}
async function savePaymentDue(item: any) {
  const payload: any = { payment_due_date: item.payment_due_date || null };
  const resp = await api.updateUser(item.id, payload);
  if (resp?.error) {
    snackbarText.value = resp.error;
    snackbar.value = true;
  }
}
async function markPaid(item: any, year: number, month: number, paid: boolean) {
  const resp = await api.markPaid(item.id, year, month, paid);
  if (resp?.error) {
    snackbarText.value = resp.error;
    snackbar.value = true;
    return;
  }
  await loadUsers();
}
async function createSlot() {
  const s = await api.createSlot(slotForm as any);
  if (s.error) return alert(s.error);
  Object.assign(slotForm, { start: "", end: "", capacity: 1 });
  loadSlots();
}
async function deleteSlot(item: any) {
  await api.deleteSlot(item.id);
  loadSlots();
}
async function openAttendees(item: any) {
  const data = await api.getAttendees(item.id);
  if (data?.error) {
    snackbarText.value = data.error;
    snackbar.value = true;
    return;
  }
  attendees.value = data.attendees || [];
  attSlot.value = data.slot || null;
  attDialog.value = true;
}
async function deleteAllSlots() {
  if (
    !confirm(
      "¿Eliminar TODOS los turnos y reservas? Esta acción no se puede deshacer."
    )
  )
    return;
  const r = await fetch(api.base + "/slots", {
    method: "DELETE",
    headers: api.headers(),
  });
  const j = await r.json();
  if (j?.error) {
    snackbarText.value = j.error;
    snackbar.value = true;
    return;
  }
  snackbarText.value = "Todos los turnos eliminados";
  snackbar.value = true;
  loadSlots();
}
async function createBulk() {
  const r = await api.createBulk(bulk as any);
  if (r.error) return alert(r.error);
  alert(`Turnos creados: ${r.created}`);
  loadSlots();
}

const weekdayItems = [
  { text: "Domingo", value: 0 },
  { text: "Lunes", value: 1 },
  { text: "Martes", value: 2 },
  { text: "Miércoles", value: 3 },
  { text: "Jueves", value: 4 },
  { text: "Viernes", value: 5 },
  { text: "Sábado", value: 6 },
];

onMounted(() => {
  if (user.value) {
    loadSlots();
    loadBookings();
    loadUsers();
  }
});
</script>

<style>
html,
body,
#app {
  height: 100%;
}
</style>
