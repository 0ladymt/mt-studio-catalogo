/* MT Studio account screens. Authentication tokens remain in HttpOnly BFF cookies. */
(() => {
  const localApi = `${location.protocol}//${location.hostname}:8787`;
  const apiBase = ["127.0.0.1", "localhost"].includes(location.hostname) ? localApi : "";
  const authPages = new Set(["cadastro", "confirmar-email", "login", "conta", "recuperar-senha", "redefinir-senha"]);
  let csrfProof = "";
  let currentSession = null;
  let sessionRequest = null;

  const forms = {
    signup: document.getElementById("signupForm"),
    confirmation: document.getElementById("confirmationForm"),
    login: document.getElementById("loginForm"),
    recovery: document.getElementById("recoveryForm"),
    passwordReset: document.getElementById("passwordResetForm"),
  };
  const statuses = {
    signup: document.getElementById("signupStatus"),
    confirmation: document.getElementById("confirmationStatus"),
    login: document.getElementById("loginStatus"),
    account: document.getElementById("accountStatus"),
    recovery: document.getElementById("recoveryStatus"),
    passwordReset: document.getElementById("passwordResetStatus"),
  };

  function showStatus(target, message = "", tone = "") {
    target.textContent = message;
    target.dataset.tone = tone;
  }

  function setBusy(form, busy) {
    form.setAttribute("aria-busy", String(busy));
    for (const control of form.elements) control.disabled = busy;
  }

  async function getCsrf(force = false) {
    if (csrfProof && !force) return csrfProof;
    const response = await fetch(`${apiBase}/api/auth/csrf`, { credentials: "include" });
    if (!response.ok) throw new Error("csrf_unavailable");
    const body = await response.json();
    csrfProof = body.csrfToken;
    return csrfProof;
  }

  async function api(path, { method = "GET", data, retryCsrf = true } = {}) {
    const headers = { Accept: "application/json" };
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = await getCsrf();
    }
    const response = await fetch(`${apiBase}${path}`, {
      method,
      credentials: "include",
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    let body = {};
    try { body = await response.json(); } catch (_) { /* Empty service response. */ }
    if (response.status === 403 && body.error === "csrf_validation_failed" && data !== undefined && retryCsrf) {
      await getCsrf(true);
      return api(path, { method, data, retryCsrf: false });
    }
    return { response, body };
  }

  async function readSession(force = false) {
    if (sessionRequest && !force) return sessionRequest;
    sessionRequest = api("/api/auth/session").then(({ response, body }) => {
      currentSession = response.ok && body.authenticated ? body : null;
      updateAccountNavigation();
      return currentSession;
    }).catch(() => {
      currentSession = null;
      updateAccountNavigation();
      return null;
    }).finally(() => { sessionRequest = null; });
    return sessionRequest;
  }

  function updateAccountNavigation() {
    const navigation = document.getElementById("accountNav");
    if (!navigation) return;
    navigation.dataset.page = currentSession ? "conta" : "login";
    navigation.textContent = currentSession ? "Minha conta" : "Entrar";
  }

  function errorMessage(error, context) {
    const messages = {
      invalid_signup_data: "Revise os dados e os requisitos da senha.",
      invalid_confirmation_data: "Informe o e-mail e o código de seis dígitos.",
      confirmation_invalid_or_expired: "Código incorreto, expirado ou já utilizado.",
      invalid_login_data: "Informe um e-mail válido e sua senha.",
      invalid_credentials: "E-mail ou senha incorretos.",
      email_not_confirmed: "Confirme seu e-mail antes de entrar.",
      already_authenticated: "Você já está autenticado.",
      too_many_requests: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      verification_temporarily_unavailable: "Não foi possível reenviar o código agora.",
      signup_temporarily_unavailable: "Não foi possível criar a conta agora.",
      confirmation_temporarily_unavailable: "Não foi possível confirmar o e-mail agora.",
      login_temporarily_unavailable: "O acesso está temporariamente indisponível.",
      invalid_password_reset_data: "Revise o e-mail, o código e os requisitos da nova senha.",
      password_reset_invalid_or_expired: "Código incorreto, expirado ou já utilizado.",
      recovery_temporarily_unavailable: "Não foi possível solicitar a recuperação agora.",
      password_reset_temporarily_unavailable: "Não foi possível redefinir a senha agora.",
      google_oauth_temporarily_unavailable: "Não foi possível iniciar o acesso com Google agora.",
    };
    return messages[error] ?? `Não foi possível concluir ${context}. Tente novamente.`;
  }

  forms.signup?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirm") ?? "");
    if (!form.reportValidity()) return;
    if (password !== confirmation) {
      showStatus(statuses.signup, "As senhas precisam ser iguais.", "error");
      document.getElementById("signupPasswordConfirm").focus();
      return;
    }
    setBusy(form, true);
    showStatus(statuses.signup, "Criando sua conta…", "loading");
    try {
      const payload = { displayName: String(data.get("displayName")), email: String(data.get("email")), password };
      const { response, body } = await api("/api/auth/signup", { method: "POST", data: payload });
      if (!response.ok) throw new Error(body.error ?? "signup_failed");
      sessionStorage.setItem("mt_pending_email", payload.email.trim().toLowerCase());
      form.reset();
      window.mtOpenPage("confirmar-email");
      fillPendingEmail();
      showStatus(statuses.confirmation, "Conta criada. Digite o código enviado ao seu e-mail.", "success");
    } catch (error) {
      showStatus(statuses.signup, errorMessage(error.message, "o cadastro"), "error");
    } finally {
      setBusy(form, false);
    }
  });

  forms.confirmation?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(form, true);
    showStatus(statuses.confirmation, "Confirmando seu e-mail…", "loading");
    try {
      const payload = { email: String(data.get("email")), token: String(data.get("token")).replace(/\D/g, "") };
      const { response, body } = await api("/api/auth/confirm-email", { method: "POST", data: payload });
      if (!response.ok) throw new Error(body.error ?? "confirmation_failed");
      sessionStorage.removeItem("mt_pending_email");
      forms.login.elements.email.value = payload.email.trim().toLowerCase();
      form.reset();
      window.mtOpenPage("login");
      showStatus(statuses.login, "E-mail confirmado. Agora você já pode entrar.", "success");
    } catch (error) {
      showStatus(statuses.confirmation, errorMessage(error.message, "a confirmação"), "error");
    } finally { setBusy(form, false); }
  });

  document.getElementById("resendVerification")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const email = forms.confirmation.elements.email.value;
    if (!forms.confirmation.elements.email.reportValidity()) return;
    button.disabled = true;
    showStatus(statuses.confirmation, "Solicitando um novo código…", "loading");
    try {
      const { response, body } = await api("/api/auth/resend-verification", { method: "POST", data: { email } });
      if (!response.ok) throw new Error(body.error ?? "resend_failed");
      showStatus(statuses.confirmation, "Se a conta estiver elegível, um novo código foi enviado.", "success");
    } catch (error) {
      showStatus(statuses.confirmation, errorMessage(error.message, "o reenvio"), "error");
    } finally { button.disabled = false; }
  });

  forms.login?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(form, true);
    showStatus(statuses.login, "Validando seu acesso…", "loading");
    try {
      const { response, body } = await api("/api/auth/login", {
        method: "POST",
        data: { email: String(data.get("email")), password: String(data.get("password")) },
      });
      form.elements.password.value = "";
      if (!response.ok) throw new Error(body.error ?? "login_failed");
      currentSession = body;
      updateAccountNavigation();
      await loadAccount();
      window.mtOpenPage("conta");
    } catch (error) {
      form.elements.password.value = "";
      showStatus(statuses.login, errorMessage(error.message, "o login"), "error");
    } finally { setBusy(form, false); }
  });

  document.querySelectorAll("[data-google-auth]").forEach((button) => {
    button.addEventListener("click", async () => {
      const form = button.closest("form");
      const status = form === forms.signup ? statuses.signup : statuses.login;
      setBusy(form, true);
      showStatus(status, "Abrindo o acesso seguro do Google…", "loading");
      try {
        const { response, body } = await api("/api/auth/google/start", { method: "POST", data: {} });
        if (!response.ok || !body.authorizationUrl) throw new Error(body.error ?? "google_oauth_failed");
        location.assign(body.authorizationUrl);
      } catch (error) {
        showStatus(status, errorMessage(error.message, "o acesso com Google"), "error");
        setBusy(form, false);
      }
    });
  });

  forms.recovery?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const email = String(new FormData(form).get("email")).trim().toLowerCase();
    setBusy(form, true);
    showStatus(statuses.recovery, "Solicitando seu código…", "loading");
    try {
      const { response, body } = await api("/api/auth/request-password-reset", { method: "POST", data: { email } });
      if (!response.ok) throw new Error(body.error ?? "recovery_failed");
      sessionStorage.setItem("mt_recovery_email", email);
      window.mtOpenPage("redefinir-senha");
      fillRecoveryEmail();
      showStatus(statuses.passwordReset, "Se a conta estiver elegível, o código foi enviado.", "success");
    } catch (error) {
      showStatus(statuses.recovery, errorMessage(error.message, "a recuperação"), "error");
    } finally { setBusy(form, false); }
  });

  forms.passwordReset?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("passwordConfirm") ?? "")) {
      showStatus(statuses.passwordReset, "As senhas precisam ser iguais.", "error");
      document.getElementById("resetPasswordConfirm").focus();
      return;
    }
    setBusy(form, true);
    showStatus(statuses.passwordReset, "Redefinindo sua senha…", "loading");
    try {
      const payload = {
        email: String(data.get("email")),
        token: String(data.get("token")).replace(/\D/g, ""),
        password,
      };
      const { response, body } = await api("/api/auth/reset-password", { method: "POST", data: payload });
      form.elements.password.value = "";
      form.elements.passwordConfirm.value = "";
      if (!response.ok) throw new Error(body.error ?? "password_reset_failed");
      sessionStorage.removeItem("mt_recovery_email");
      currentSession = null;
      updateAccountNavigation();
      forms.login.elements.email.value = payload.email.trim().toLowerCase();
      form.reset();
      window.mtOpenPage("login");
      showStatus(statuses.login, "Senha redefinida. Entre novamente com sua nova senha.", "success");
    } catch (error) {
      form.elements.password.value = "";
      form.elements.passwordConfirm.value = "";
      showStatus(statuses.passwordReset, errorMessage(error.message, "a redefinição"), "error");
    } finally { setBusy(form, false); }
  });

  document.getElementById("resendRecovery")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const email = forms.passwordReset.elements.email.value;
    if (!forms.passwordReset.elements.email.reportValidity()) return;
    button.disabled = true;
    showStatus(statuses.passwordReset, "Solicitando um novo código…", "loading");
    try {
      const { response, body } = await api("/api/auth/request-password-reset", { method: "POST", data: { email } });
      if (!response.ok) throw new Error(body.error ?? "recovery_failed");
      showStatus(statuses.passwordReset, "Se a conta estiver elegível, um novo código foi enviado.", "success");
    } catch (error) {
      showStatus(statuses.passwordReset, errorMessage(error.message, "o reenvio"), "error");
    } finally { button.disabled = false; }
  });

  document.getElementById("logoutButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    showStatus(statuses.account, "Encerrando sua sessão…", "loading");
    try {
      const { response, body } = await api("/api/auth/logout", { method: "POST", data: {} });
      if (!response.ok) throw new Error(body.error ?? "logout_failed");
      currentSession = null;
      csrfProof = "";
      updateAccountNavigation();
      window.mtOpenPage("login");
      showStatus(statuses.login, "Sessão encerrada com segurança.", "success");
    } catch (_) {
      showStatus(statuses.account, "Não foi possível sair agora. Tente novamente.", "error");
    } finally { button.disabled = false; }
  });

  function fillPendingEmail() {
    const pendingEmail = sessionStorage.getItem("mt_pending_email");
    if (pendingEmail && forms.confirmation) forms.confirmation.elements.email.value = pendingEmail;
  }

  function fillRecoveryEmail() {
    const recoveryEmail = sessionStorage.getItem("mt_recovery_email");
    if (recoveryEmail && forms.passwordReset) forms.passwordReset.elements.email.value = recoveryEmail;
  }

  async function loadAccount() {
    const session = currentSession ?? await readSession(true);
    if (!session) return false;
    const { response, body } = await api("/api/profile");
    if (!response.ok) return false;
    const name = body.profile?.display_name || "Cliente";
    document.getElementById("accountName").textContent = `${name}.`;
    document.getElementById("accountDisplayName").textContent = name;
    document.getElementById("accountEmail").textContent = session.user?.email || "E-mail confirmado";
    showStatus(statuses.account);
    return true;
  }

  window.addEventListener("mt:page", async (event) => {
    const page = event.detail;
    if (!authPages.has(page)) return;
    if (page === "confirmar-email") fillPendingEmail();
    if (page === "redefinir-senha") fillRecoveryEmail();
    const session = await readSession();
    if (page === "conta" && !session) {
      window.mtOpenPage("login");
      showStatus(statuses.login, "Entre para acessar sua conta.", "info");
      return;
    }
    if (["login", "cadastro", "recuperar-senha", "redefinir-senha"].includes(page) && session) {
      await loadAccount();
      window.mtOpenPage("conta");
      return;
    }
    if (page === "conta") await loadAccount();
  });

  document.addEventListener("DOMContentLoaded", () => {
    fillPendingEmail();
    fillRecoveryEmail();
    readSession().then((session) => {
      if (location.hash === "#conta" && !session) window.mtOpenPage("login");
      if (location.hash === "#conta" && session) loadAccount();
    });
    const oauthResult = new URLSearchParams(location.search).get("oauth");
    if (oauthResult === "cancelled") {
      showStatus(statuses.login, "O acesso com Google foi cancelado. Nenhuma sessão foi criada.", "info");
      history.replaceState(null, "", `${location.pathname}${location.hash || "#login"}`);
    }
  });
})();
