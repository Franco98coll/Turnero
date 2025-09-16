import Vue from "vue";
import Vuetify from "vuetify";
import "vuetify/dist/vuetify.min.css";
import "sweetalert2/dist/sweetalert2.min.css";
import App from "./App.vue";
import router from "./router";

Vue.use(Vuetify);

const vuetify = new Vuetify({
  icons: { iconfont: "md" },
  theme: {
    themes: {
      light: {
        primary: "#D7263D", // Rojo Phoenix
        secondary: "#111827", // Gris muy oscuro/negro
        accent: "#F59E0B", // Dorado/ámbar para acentos
        info: "#2563EB",
        warning: "#F59E0B",
        error: "#DC2626",
        success: "#10B981",
      },
      dark: {
        primary: "#F43F5E", // Rojo/rosa vibrante legible en dark
        secondary: "#1F2937",
        accent: "#FBBF24",
        info: "#93C5FD",
        warning: "#F59E0B",
        error: "#F87171",
        success: "#34D399",
      },
    },
    dark: false,
  },
});

new Vue({
  vuetify,
  router,
  render: (h) => h(App),
} as any).$mount("#app");
