export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(data, { status = 200, origin = '*' } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

export function empty(status = 204, origin = '*') {
  return new Response(null, {
    status,
    headers: corsHeaders(origin),
  });
}

export function error(message, { status = 500, origin = '*' } = {}) {
  return json({ message }, { status, origin });
}
