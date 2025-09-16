import Vue from "vue";
import Vuetify from "vuetify";
import "vuetify/dist/vuetify.min.css";
import App from "./App.vue";
import router from "./router";

Vue.use(Vuetify);

const vuetify = new Vuetify({
  icons: { iconfont: "md" },
  theme: {
    themes: {
      light: {
        primary: "#7C3AED", // morado vibrante
        secondary: "#0EA5E9",
        accent: "#22C55E",
        info: "#60A5FA",
        warning: "#F59E0B",
        error: "#EF4444",
        success: "#10B981",
      },
      dark: {
        primary: "#A78BFA",
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
