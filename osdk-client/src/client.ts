import { FoundryClient, PublicClientAuth } from "@fraud/sdk";

const url = import.meta.env.VITE_FOUNDRY_API_URL;
const clientId = import.meta.env.VITE_FOUNDRY_CLIENT_ID;
const redirectUrl = import.meta.env.VITE_FOUNDRY_REDIRECT_URL;
checkEnv(url, "VITE_FOUNDRY_API_URL");
checkEnv(clientId, "VITE_FOUNDRY_CLIENT_ID");
checkEnv(redirectUrl, "VITE_FOUNDRY_REDIRECT_URL");

const SCOPES = [
    "deployed-apps:submit",
    "api:read-data",
    "api:write-data",
    "mio:read-media-set",
    "mio:write-media-set",
    "function-registry:read-function",
    "offline_access",
];

function checkEnv(
  value: string | undefined,
  name: string,
): asserts value is string {
  if (value == null) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

/**
 * Initialize the client to interact with the Ontology SDK
 */
const client = new FoundryClient({
  url,
  auth: new PublicClientAuth({
    clientId: clientId,
    url: url,
    redirectUrl: redirectUrl,
    scopes: SCOPES,
  }),
});

export default client;
