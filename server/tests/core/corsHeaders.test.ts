
  });

  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object", "address deve estar disponível");
  const port = address.port;

  const response = await fetch(`http://127.0.0.1:${port}/api/ask-eco`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type, X-Guest-Id, X-Guest-Mode",
    },
  });

  assert.equal(response.status, 204);
  const allowHeaders = response.headers.get("access-control-allow-headers") ?? "";
  assert.match(
    allowHeaders,
    /x-guest-id/i,
    "deve expor X-Guest-Id no preflight do modo convidado"
  );
  assert.match(
    allowHeaders,
    /x-guest-mode/i,
    "deve expor X-Guest-Mode no preflight do modo convidado"
  );
});
