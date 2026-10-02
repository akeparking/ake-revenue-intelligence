import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { demoFixtures } from "@ake/contracts";
import { loadConfig } from "../config";
import { InboxService } from "../inbox/inbox.service";
import { mockQualification } from "../inbox/qualification";

@Injectable()
export class DemoSeeder implements OnApplicationBootstrap {
  constructor(private readonly inbox: InboxService) {}
  async onApplicationBootstrap() {
    const config = loadConfig();
    if (!config.demoSeed) return;
    for (const fixture of demoFixtures) {
      await this.inbox.receive(config.defaultWorkspaceId, {
        eventId: `fixture-v01:${fixture.key}`, conversationId: `fixture:${fixture.key}`,
        channel: fixture.channel, displayName: fixture.displayName, message: fixture.message,
        isTest: true, occurredAt: new Date().toISOString(),
      }, { analysis: mockQualification(fixture.message), provider: "mock" });
    }
  }
}
