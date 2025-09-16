import Swal from "sweetalert2";

export function useNotify() {
  function confirmAction({
    title = "¿Confirmar?",
    text = "Esta acción no se puede deshacer.",
    confirmButtonText = "Sí",
    cancelButtonText = "No",
    icon = "question",
  }: {
    title?: string;
    text?: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
    icon?: "question" | "warning" | "info" | "error" | "success";
  } = {}): Promise<boolean> {
    return Swal.fire({
      title,
      text,
      icon,
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText,
      confirmButtonColor:
        getComputedStyle(document.documentElement).getPropertyValue(
          "--v-primary-base"
        ) || undefined,
    }).then((r) => r.isConfirmed === true);
  }

  function toast(
    message: string,
    type: "success" | "error" | "warning" | "info" = "info"
  ) {
    const Toast = (Swal as any).mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
    });
    Toast.fire({ icon: type, title: message });
  }

  return { confirmAction, toast };
}
