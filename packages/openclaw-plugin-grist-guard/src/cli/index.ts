import type { BrokerClient } from "../broker/contracts.js";

function print(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

export function registerCliCommands(api: any, client: BrokerClient) {
  api.registerCli(
    ({ program }: { program: { command(name: string): any } }) => {
      program
        .command("grist-approve <planId>")
        .description("Approve a broker plan as a human operator")
        .option("-c, --comment <comment>", "approval comment")
        .action(async (planId: string, options: { comment?: string }) => {
          const response = await client.approvePlan(planId, options.comment);
          print({
            ok: true,
            requestId: response.requestId,
            planId: response.plan.id,
            status: response.plan.status,
            requiresApproval: response.plan.requiresApproval,
            warnings: response.plan.warnings,
          });
        });

      program
        .command("grist-plan <planId>")
        .description("Show broker plan status")
        .action(async (planId: string) => {
          const response = await client.getPlan(planId);
          print(response);
        });

      program
        .command("grist-exec <executionId>")
        .description("Show broker execution status")
        .action(async (executionId: string) => {
          const response = await client.getExecution(executionId);
          print(response);
        });
    },
    { commands: ["grist-approve", "grist-plan", "grist-exec"] },
  );
}
