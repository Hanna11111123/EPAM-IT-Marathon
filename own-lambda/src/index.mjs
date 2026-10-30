// Lambda handler. API Gateway (HTTP API, payload format 2.0) calls this function.
// The response "body" must be a string, so we use JSON.stringify.
export const handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Hello from my own Lambda deployed with Terraform!",
      path: event.rawPath,
      time: new Date().toISOString(),
    }),
  };
};
