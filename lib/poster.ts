import "server-only";

type PosterSettings = {
  account_name: string;
  access_token: string;
  username?: string;
  password?: string;
  use_token?: number;
  order_spot_id?: string;
};

type PosterApiResponse<T> = {
  response?: T;
  error?: {
    code?: number;
    message?: string;
  };
};

function buildPosterUrl(accountName: string, method: string, params?: Record<string, string | number>) {
  const searchParams = new URLSearchParams({ format: "json", ...Object.fromEntries(
    Object.entries(params ?? {}).map(([key, value]) => [key, String(value)]),
  ) });
  return `https://${accountName}.joinposter.com/api/${method}?${searchParams.toString()}`;
}

async function posterGet<T>(
  settings: PosterSettings,
  method: string,
  params?: Record<string, string | number>,
) {
  if (!settings.account_name) {
    throw new Error("Missing Poster account name");
  }
  if (!settings.access_token) {
    if (settings.use_token === 0 && (settings.username || settings.password)) {
      throw new Error(
        "Poster public API requires an access token. Username/password can be stored in admin settings, but sync and API requests still require a Poster token."
      );
    }
    throw new Error("Missing Poster access token");
  }
  const url = buildPosterUrl(settings.account_name, method, {
    token: settings.access_token,
    ...(params ?? {}),
  });
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Poster HTTP ${response.status}`);
  }

  const data = (await response.json()) as PosterApiResponse<T>;
  if (data.error) {
    throw new Error(data.error.message ?? "Poster API error");
  }

  return data.response;
}

async function posterPost<T>(
  settings: PosterSettings,
  method: string,
  params?: Record<string, string | number>,
) {
  if (!settings.account_name) {
    throw new Error("Missing Poster account name");
  }
  if (!settings.access_token) {
    throw new Error("Missing Poster access token");
  }

  const url = buildPosterUrl(settings.account_name, method);
  const body = new URLSearchParams({
    token: settings.access_token,
    format: "json",
    ...Object.fromEntries(
      Object.entries(params ?? {}).map(([key, value]) => [key, String(value)]),
    ),
  });

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Poster HTTP ${response.status}`);
  }

  const data = (await response.json()) as PosterApiResponse<T>;
  if (data.error) {
    throw new Error(data.error.message ?? "Poster API error");
  }

  return data.response;
}

export async function testPosterConnection(settings: PosterSettings) {
  return posterGet(settings, "settings.getCompanyName");
}

export async function fetchPosterCategories(settings: PosterSettings) {
  return posterGet<Array<Record<string, unknown>>>(settings, "menu.getCategories");
}

export async function fetchPosterProducts(settings: PosterSettings) {
  return posterGet<Array<Record<string, unknown>>>(settings, "menu.getProducts");
}

export type PosterIncomingOrderPayload = {
  spot_id: string;
  phone: string;
  first_name: string;
  last_name: string;
  address: string;
  comment: string;
  products: string;
  payment?: string;
};

export async function createPosterIncomingOrder(
  settings: PosterSettings,
  payload: PosterIncomingOrderPayload,
) {
  return posterPost<Record<string, unknown>>(
    settings,
    "incomingOrders.createIncomingOrder",
    payload,
  );
}
