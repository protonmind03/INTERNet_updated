import { defineRailway, github, postgres, project, service, volume } from "railway/iac";

/*
|--------------------------------------------------------------------------
| RAILWAY: THE WHOLE PROJECT, AS CODE
|--------------------------------------------------------------------------
|
| Replaces backend/railway.json and the root railway.json, which Railway
| stops reading on 1 December 2026. One file for the whole project, so every
| resource it should keep is listed here: an apply deletes what is left out.
|
| Started from `railway config pull --variables unmanaged` (the live state:
| Postgres, both volumes, the uploads mount at /data) and given by hand the
| settings the two railway.json files held. `railway config migrate` was not
| used as it stands: it made two new services named after the folders
| ("backend", "INTERNet") and left the builder, Dockerfile and cron as
| comments.
|
|   INTERNet_updated   the API. Migrations before each deploy, ready check,
|                      restart on failure up to 5 times. Production deploys
|                      main, staging ui-redesign.
|   backup             production only: the nightly encrypted database
|                      backup (backup.Dockerfile), 17:30 UTC = 01:30 Manila.
|   Postgres, volumes  as they are.
|
| Variables are not managed here (variables.managed false): every secret
| stays in the dashboard and this file never reads or writes one.
|
| Plan first, in each environment (DEPLOY.md, "Railway settings as code").
|
*/

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");

  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };

  const alerts = { usage: { "100": {}, "80": {}, "95": {} } };
  const uploadsVolume = volume("internet_updated-volume", { alerts, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const postgresVolume = volume("postgres-volume", { alerts, allowOnlineResize: true, region: "sfo", sizeMB: 500 });

  // Was backend/railway.json.
  const api = service("INTERNet_updated", {
    source: github("protonmind03/INTERNet_updated", {
      branch: production ? "main" : "ui-redesign",
      checkSuites: true,
      rootDirectory: "/backend",
    }),
    replicas: { sfo: 1 },
    networking: { privateNetworkEndpoint: "internetupdated" },
    volumeMounts: { "/data": uploadsVolume },
    build: { builder: "RAILPACK" },
    deploy: {
      preDeployCommand: ["npm run db:migrate"],
      startCommand: "npm start",
      healthcheckPath: "/api/health/ready",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
  });

  // Was the root railway.json. Production only, as today.
  const backup = service("backup", {
    source: github("protonmind03/INTERNet_updated", { branch: "main", checkSuites: false, rootDirectory: "/" }),
    replicas: { sfo: 1 },
    build: { builder: "DOCKERFILE", dockerfilePath: "backup.Dockerfile" },
    deploy: {
      startCommand: "npm run backup:database",
      cronSchedule: "30 17 * * *",
      restartPolicyType: "NEVER",
    },
  });

  return project("balanced-flexibility", {
    variables: { managed: false },
    resources: [api, Postgres, uploadsVolume, postgresVolume, ...(production ? [backup] : [])],
  });
});
