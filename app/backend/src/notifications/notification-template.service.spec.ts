import { NotificationTemplateService } from "./notification-template.service";
import { NotificationPayload } from "./types/notification.types";

describe("NotificationTemplateService", () => {
  let service: NotificationTemplateService;

  beforeEach(() => {
    service = new NotificationTemplateService();
  });

  it("should render EscrowDeposited correctly", () => {
    const payload = {
      eventType: "EscrowDeposited",
      amountStroops: 100000000n, // 10 XLM
    } as unknown as NotificationPayload;

    const result = service.render(payload);
    expect(result.title).toBe("Escrow Deposit Confirmed");
    expect(result.body).toContain("10.0000000 XLM");
  });

  it("should render payment.received correctly", () => {
    const payload = {
      eventType: "payment.received",
      amountStroops: 50000000n, // 5 XLM
      sender: "GABCDEFGH12345678",
    } as unknown as NotificationPayload;

    const result = service.render(payload);
    expect(result.title).toBe("Payment Received");
    expect(result.body).toContain("5.0000000 XLM");
    expect(result.body).toContain("GABCDEFG...");
  });

  it("should render username.claimed correctly", () => {
    const payload = {
      eventType: "username.claimed",
      username: "alice",
    } as unknown as NotificationPayload;

    const result = service.render(payload);
    expect(result.title).toBe("Username Registered");
    expect(result.body).toContain("@alice");
  });

  it("should fall back for unknown events", () => {
    const payload = {
      eventType: "unknown.event",
      title: "Custom Title",
      body: "Custom Body",
    } as unknown as NotificationPayload;

    const result = service.render(payload);
    expect(result.title).toBe("Custom Title");
    expect(result.body).toBe("Custom Body");
  });
});
