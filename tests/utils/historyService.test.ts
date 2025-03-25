import { HistoryMessage, historyService } from "../../src/utils/historyService";

jest.mock("../../src/bot", () => ({
  log: jest.fn(),
  CHANNELS: [],
}));

describe("HistoryService", () => {
  beforeEach(() => {
    const users = ["user1", "user2", "user3"];
    users.forEach(userId => {
      if (historyService.hasHistory(userId)) {
        historyService.clearHistory(userId);
      }
    });
  });

  it("should initialize with empty history for new users", () => {
    const userId = "user1";
    const history = historyService.getUserHistory(userId);
    expect(history).toEqual([]);
    expect(historyService.hasHistory(userId)).toBe(false);
  });

  it("should add messages to user history", () => {
    const userId = "user1";
    const message: HistoryMessage = {
      role: "user",
      content: "Hello, world!",
    };

    historyService.addMessage(userId, message);

    const history = historyService.getUserHistory(userId);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(message);
    expect(historyService.hasHistory(userId)).toBe(true);
  });

  it("should add multiple messages at once", () => {
    const userId = "user1";
    const messages: HistoryMessage[] = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];

    historyService.addMessages(userId, messages);

    const history = historyService.getUserHistory(userId);
    expect(history).toHaveLength(2);
    expect(history).toEqual(messages);
  });

  it("should clear user history", () => {
    const userId = "user1";
    const message: HistoryMessage = {
      role: "user",
      content: "Hello, world!",
    };

    historyService.addMessage(userId, message);
    expect(historyService.hasHistory(userId)).toBe(true);

    historyService.clearHistory(userId);
    expect(historyService.hasHistory(userId)).toBe(false);
    expect(historyService.getUserHistory(userId)).toEqual([]);
  });

  it("should maintain separate histories for different users", () => {
    const user1 = "user1";
    const user2 = "user2";

    const message1: HistoryMessage = { role: "user", content: "Message from user 1" };
    const message2: HistoryMessage = { role: "user", content: "Message from user 2" };

    historyService.addMessage(user1, message1);
    historyService.addMessage(user2, message2);

    expect(historyService.getUserHistory(user1)).toEqual([message1]);
    expect(historyService.getUserHistory(user2)).toEqual([message2]);
  });
});
