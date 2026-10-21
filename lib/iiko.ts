import "server-only";

export type IikoSettings = {
  base_url: string;
  api_login: string;
  organization_id?: string;
};

type IikoTokenResponse = {
  correlationId: string;
  token: string;
};

type IikoErrorResponse = {
  errorDescription?: string;
  error?: string;
};

let cachedToken: { apiLogin: string; token: string; expiresAt: number } | null = null;

function baseUrl(settings: IikoSettings) {
  return (settings.base_url || "https://api-ru.iiko.services").replace(/\/$/, "");
}

async function post<T>(
  settings: IikoSettings,
  path: string,
  payload: Record<string, unknown>,
  token?: string,
) {
  const response = await fetch(`${baseUrl(settings)}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: T & IikoErrorResponse;
  try {
    data = JSON.parse(text) as T & IikoErrorResponse;
  } catch {
    throw new Error(`iiko HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(
      data.errorDescription || data.error || `iiko HTTP ${response.status}`,
    );
  }

  return data as T;
}

export async function getIikoToken(settings: IikoSettings) {
  const apiLogin = settings.api_login.trim();
  if (!apiLogin) throw new Error("Укажите API Login iiko");

  if (
    cachedToken?.apiLogin === apiLogin &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.token;
  }

  const result = await post<IikoTokenResponse>(
    settings,
    "/api/1/access_token",
    { apiLogin },
  );
  cachedToken = {
    apiLogin,
    token: result.token,
    expiresAt: Date.now() + 55 * 60_000,
  };
  return result.token;
}

async function authorizedPost<T>(
  settings: IikoSettings,
  path: string,
  payload: Record<string, unknown>,
) {
  const token = await getIikoToken(settings);
  return post<T>(settings, path, payload, token);
}

export type IikoOrganization = { id: string; name: string };

export async function fetchIikoOrganizations(settings: IikoSettings) {
  return authorizedPost<{ organizations: IikoOrganization[] }>(
    settings,
    "/api/1/organizations",
    { returnAdditionalInfo: true, includeDisabled: false },
  );
}

export async function fetchIikoNomenclature(
  settings: IikoSettings,
  organizationId: string,
  startRevision = 0,
) {
  return authorizedPost<Record<string, unknown>>(settings, "/api/1/nomenclature", {
    organizationId,
    startRevision,
  });
}

export async function fetchIikoReferences(
  settings: IikoSettings,
  organizationId: string,
) {
  const organizationIds = [organizationId];
  const [terminals, orderTypes, paymentTypes] = await Promise.all([
    authorizedPost<Record<string, unknown>>(settings, "/api/1/terminal_groups", {
      organizationIds,
      includeDisabled: false,
    }),
    authorizedPost<Record<string, unknown>>(settings, "/api/1/deliveries/order_types", {
      organizationIds,
    }),
    authorizedPost<Record<string, unknown>>(settings, "/api/1/payment_types", {
      organizationIds,
    }),
  ]);
  return { terminals, orderTypes, paymentTypes };
}

export async function createIikoDelivery(
  settings: IikoSettings,
  payload: Record<string, unknown>,
) {
  return authorizedPost<Record<string, unknown>>(
    settings,
    "/api/1/deliveries/create",
    payload,
  );
}
