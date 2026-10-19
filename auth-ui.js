/* MT Studio account screens. Authentication tokens remain in HttpOnly BFF cookies. */
(() => {
  const localApi = `${location.protocol}//${location.hostname}:8787`;
  const apiBase = ["127.0.0.1", "localhost"].includes(location.hostname) ? localApi : "";
  const authPages = new Set(["cadastro", "confirmar-email", "login", "conta", "recuperar-senha", "redefinir-senha"]);
  let csrfProof = "";
  let currentSession = null;
  let sessionRequest = null;
  let pendingAccountNotice = null;

  const forms = {
    signup: document.getElementById("signupForm"),
    confirmation: document.getElementById("confirmationForm"),
    login: document.getElementById("loginForm"),
    recovery: document.getElementById("recoveryForm"),
    passwordReset: document.getElementById("passwordResetForm"),
    googleLink: document.getElementById("googleLinkForm"),
    passwordSetup: document.getElementById("passwordSetupForm"),
  };
  const statuses = {
    signup: document.getElementById("signupStatus"),
    confirmation: document.getElementById("confirmationStatus"),
    login: document.getElementById("loginStatus"),
    account: document.getElementById("accountStatus"),
    recovery: document.getElementById("recoveryStatus"),
    passwordReset: document.getElementById("passwordResetStatus"),
    passwordSetup: document.getElementById("passwordSetupStatus"),
  };

  function showStatus(target, message = "", tone = "") {
    target.textContent = message;
    target.dataset.tone = tone;
  }

  const passwordRules = [
    { key: "length", label: "12 caracteres ou mais", test: (value) => value.length >= 12 },
    { key: "uppercase", label: "Uma letra maiúscula", test: (value) => /[A-Z]/.test(value) },
    { key: "lowercase", label: "Uma letra minúscula", test: (value) => /[a-z]/.test(value) },
    { key: "number", label: "Um número", test: (value) => /[0-9]/.test(value) },
    { key: "symbol", label: "Um símbolo", test: (value) => /[^A-Za-z0-9]/.test(value) },
    { key: "match", label: "As senhas coincidem", test: (value, confirmation) => Boolean(confirmation) && value === confirmation },
  ];
  const passwordChecklists = new Map();

  function updatePasswordChecklist(checklist, announce = false) {
    const password = checklist.passwordInput.value;
    const confirmation = checklist.confirmationInput.value;
    const started = Boolean(password || confirmation);
    const unmet = [];

    for (const rule of passwordRules) {
      const met = rule.test(password, confirmation);
      const item = checklist.items.get(rule.key);
      const state = !started ? "neutral" : met ? "met" : "pending";
      item.dataset.state = state;
      item.querySelector(".mt-password-requirement__state").textContent = state === "met" ? "Atendido" : state === "pending" ? "Pendente" : "Neutro";
      item.setAttribute("aria-label", `${rule.label}: ${state === "met" ? "atendido" : state === "pending" ? "pendente" : "não avaliado"}`);
      if (!met) unmet.push(rule);
    }

    if (announce) {
      checklist.summary.textContent = unmet.length
        ? `A senha ainda precisa atender: ${unmet.map((rule) => rule.label.toLowerCase()).join(", ")}.`
        : "Todos os requisitos da senha foram atendidos.";
    } else if (!started) {
      checklist.summary.textContent = "";
    }
    return { valid: unmet.length === 0, unmet };
  }

  function createPasswordChecklist(container) {
    const passwordInput = document.getElementById(container.dataset.passwordField);
    const confirmationInput = document.getElementById(container.dataset.confirmationField);
    if (!passwordInput || !confirmationInput) return;

    const title = document.createElement("p");
    title.className = "mt-password-checklist__title";
    title.textContent = "Sua senha precisa ter:";
    const list = document.createElement("ul");
    list.className = "mt-password-checklist__list";
    const summary = document.createElement("p");
    summary.className = "sr-only";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    summary.setAttribute("aria-atomic", "true");
    const items = new Map();

    for (const rule of passwordRules) {
      const item = document.createElement("li");
      item.dataset.rule = rule.key;
      item.dataset.state = "neutral";
      item.innerHTML = `<span class="mt-password-requirement__marker" aria-hidden="true"></span><span class="mt-password-requirement__label">${rule.label}</span><span class="mt-password-requirement__state">Neutro</span>`;
      list.append(item);
      items.set(rule.key, item);
    }

    container.append(title, list, summary);
    const checklist = { container, passwordInput, confirmationInput, items, summary };
    passwordChecklists.set(passwordInput.form?.id, checklist);
    const update = () => updatePasswordChecklist(checklist);
    passwordInput.addEventListener("input", update);
    confirmationInput.addEventListener("input", update);
    passwordInput.form?.addEventListener("reset", () => queueMicrotask(update));
    update();
  }

  function validatePasswordChecklist(form, status) {
    const checklist = passwordChecklists.get(form.id);
    if (!checklist) return true;
    const result = updatePasswordChecklist(checklist, true);
    if (result.valid) return true;
    showStatus(status, checklist.summary.textContent, "error");
    const onlyMismatch = result.unmet.length === 1 && result.unmet[0].key === "match";
    (onlyMismatch ? checklist.confirmationInput : checklist.passwordInput).focus();
    return false;
  }

  document.querySelectorAll("[data-password-checklist]").forEach(createPasswordChecklist);

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
      invalid_password_confirmation: "Informe sua senha atual.",
      recent_reauthentication_required: "Confirme sua senha novamente para continuar.",
      google_link_not_eligible: "Esta conta não está elegível para vinculação neste momento.",
      google_already_linked: "O Google já está vinculado a esta conta.",
      google_link_temporarily_unavailable: "Não foi possível iniciar a vinculação agora.",
      password_setup_not_eligible: "Esta conta não está elegível para definir senha.",
      password_already_configured: "Esta conta já possui uma senha configurada.",
      password_setup_session_invalid: "Sua sessão expirou. Entre novamente para continuar.",
      invalid_password_setup_data: "Revise o código e os requisitos da nova senha.",
      password_setup_invalid_or_expired: "Código incorreto, expirado ou já utilizado.",
      password_setup_temporarily_unavailable: "Não foi possível definir a senha agora.",
    };
    return messages[error] ?? `Não foi possível concluir ${context}. Tente novamente.`;
  }

  forms.signup?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (!form.reportValidity()) return;
    if (!validatePasswordChecklist(form, statuses.signup)) return;
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
    if (!validatePasswordChecklist(form, statuses.passwordReset)) return;
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

  document.getElementById("showGoogleLinkForm")?.addEventListener("click", () => {
    forms.googleLink.hidden = false;
    forms.googleLink.elements.password.focus();
  });

  document.getElementById("cancelGoogleLink")?.addEventListener("click", () => {
    forms.googleLink.reset();
    forms.googleLink.hidden = true;
    document.getElementById("showGoogleLinkForm").focus();
  });

  forms.googleLink?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const password = String(new FormData(form).get("password") ?? "");
    setBusy(form, true);
    showStatus(statuses.account, "Confirmando sua identidade…", "loading");
    try {
      const reauthentication = await api("/api/auth/reauthenticate-password", { method: "POST", data: { password } });
      form.elements.password.value = "";
      if (!reauthentication.response.ok) throw new Error(reauthentication.body.error ?? "reauthentication_failed");
      const linking = await api("/api/auth/google/link/start", { method: "POST", data: {} });
      if (!linking.response.ok || !linking.body.authorizationUrl) throw new Error(linking.body.error ?? "google_link_failed");
      location.assign(linking.body.authorizationUrl);
    } catch (error) {
      form.elements.password.value = "";
      showStatus(statuses.account, errorMessage(error.message, "a vinculação"), "error");
      setBusy(form, false);
    }
  });

  document.getElementById("showPasswordSetupForm")?.addEventListener("click", () => {
    forms.passwordSetup.hidden = false;
    document.getElementById("requestPasswordSetupCode").focus();
  });

  document.getElementById("cancelPasswordSetup")?.addEventListener("click", () => {
    forms.passwordSetup.reset();
    forms.passwordSetup.hidden = true;
    document.getElementById("passwordSetupFields").hidden = true;
    showStatus(statuses.passwordSetup);
    document.getElementById("showPasswordSetupForm").focus();
  });

  async function requestPasswordSetupCode(button) {
    button.disabled = true;
    showStatus(statuses.passwordSetup, "Enviando seu código de segurança…", "loading");
    try {
      const { response, body } = await api("/api/auth/password/setup/request", { method: "POST", data: {} });
      if (!response.ok) throw new Error(body.error ?? "password_setup_failed");
      document.getElementById("passwordSetupFields").hidden = false;
      forms.passwordSetup.elements.token.focus();
      showStatus(statuses.passwordSetup, "Código enviado ao e-mail confirmado da sua conta.", "success");
    } catch (error) {
      showStatus(statuses.passwordSetup, errorMessage(error.message, "o envio do código"), "error");
    } finally { button.disabled = false; }
  }

  document.getElementById("requestPasswordSetupCode")?.addEventListener("click", (event) => requestPasswordSetupCode(event.currentTarget));
  document.getElementById("resendPasswordSetupCode")?.addEventListener("click", (event) => requestPasswordSetupCode(event.currentTarget));

  forms.passwordSetup?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (!validatePasswordChecklist(form, statuses.passwordSetup)) return;
    const token = String(data.get("token") ?? "").trim();
    setBusy(form, true);
    showStatus(statuses.passwordSetup, "Configurando seu novo método de acesso…", "loading");
    try {
      const { response, body } = await api("/api/auth/password/setup/confirm", {
        method: "POST",
        data: { token, password },
      });
      if (!response.ok) throw new Error(body.error ?? "password_setup_failed");
      form.reset();
      currentSession = null;
      csrfProof = "";
      updateAccountNavigation();
      window.mtOpenPage("login");
      showStatus(statuses.login, "Senha configurada. Entre novamente com Google ou e-mail e senha.", "success");
    } catch (error) {
      form.elements.token.value = "";
      showStatus(statuses.passwordSetup, errorMessage(error.message, "a definição da senha"), "error");
      setBusy(form, false);
      form.elements.token.focus();
    }
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
    const methodsResponse = await api("/api/auth/access-methods");
    if (methodsResponse.response.ok) updateAccessMethods(methodsResponse.body);
    if (pendingAccountNotice) {
      showStatus(statuses.account, pendingAccountNotice.message, pendingAccountNotice.tone);
      pendingAccountNotice = null;
    } else {
      showStatus(statuses.account);
    }
    return true;
  }

  function updateAccessMethods(access) {
    const hasPassword = Boolean(access.methods?.password);
    const hasGoogle = Boolean(access.methods?.google);
    document.getElementById("passwordMethodState").textContent = hasPassword ? "Ativo e confirmado" : "Não configurado";
    document.getElementById("passwordMethodBadge").hidden = !hasPassword;
    document.getElementById("googleMethodState").textContent = hasGoogle ? "Acesso disponível" : "Ainda não vinculado";
    document.getElementById("googleLinkedBadge").hidden = !hasGoogle;
    document.getElementById("showGoogleLinkForm").hidden = hasGoogle || !hasPassword || !access.emailConfirmed;
    document.getElementById("showPasswordSetupForm").hidden = !access.actions?.canSetupPassword;
    if (hasGoogle) forms.googleLink.hidden = true;
    if (!access.actions?.canSetupPassword) forms.passwordSetup.hidden = true;
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
    const linkResult = new URLSearchParams(location.search).get("link");
    if (linkResult) {
      const messages = {
        "google-linked": ["Google vinculado com segurança à sua conta.", "success"],
        cancelled: ["A vinculação com Google foi cancelada. Sua conta não foi alterada.", "info"],
        failed: ["Não foi possível concluir a vinculação com Google.", "error"],
      };
      const [message, tone] = messages[linkResult] ?? messages.failed;
      pendingAccountNotice = { message, tone };
      history.replaceState(null, "", `${location.pathname}#conta`);
    }
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
