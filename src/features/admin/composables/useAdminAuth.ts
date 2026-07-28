import { ref } from "vue";
import { login, checkSession, logout } from "../api";

export function useAdminAuth() {
  const isAuthenticated = ref(false);
  const csrfToken = ref("");
  const loading = ref(false);
  const error = ref("");

  async function check() {
    loading.value = true;
    error.value = "";
    try {
      const result = await checkSession();
      if (result.ok && result.data.authenticated) {
        isAuthenticated.value = true;
        csrfToken.value = result.data.csrfToken;
      } else {
        isAuthenticated.value = false;
        csrfToken.value = "";
      }
    } catch {
      isAuthenticated.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function doLogin(password: string): Promise<boolean> {
    loading.value = true;
    error.value = "";
    try {
      const result = await login(password);
      if (result.ok) {
        isAuthenticated.value = true;
        csrfToken.value = result.data.csrfToken;
        return true;
      }
      error.value = result.error.message;
      return false;
    } catch {
      error.value = "登录失败，请重试";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function doLogout() {
    await logout();
    isAuthenticated.value = false;
    csrfToken.value = "";
  }

  return { isAuthenticated, csrfToken, loading, error, check, doLogin, doLogout };
}
