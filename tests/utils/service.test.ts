import axios, { AxiosResponse } from "axios";

import { ChatOptions } from "../../src/commands/chat";
import { getModelInfo, getModels, makeRequest, METHOD } from "../../src/utils/service";

jest.mock("axios");

jest.mock("../../src/bot", () => ({
  log: jest.fn(),
  CHANNELS: [],
}));

const mockedAxios = axios as unknown as jest.Mock;
const mockedAxiosGet = axios.get as unknown as jest.Mock;
const mockedAxiosPost = axios.post as unknown as jest.Mock;

describe("Service utilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("makeRequest", () => {
    it("should make a request with correct parameters", async () => {
      const server = "http://test-server:11434";
      const endpoint = "/api/test";
      const method = METHOD.POST;
      const data = { model: "test-model", prompt: "Hello" };

      mockedAxios.mockResolvedValueOnce({
        data: { response: "Test response" },
      } as AxiosResponse);

      const result = await makeRequest(server, endpoint, method, data);

      expect(axios).toHaveBeenCalledWith({
        method: METHOD.POST,
        url: "http://test-server:11434/api/test",
        data,
        responseType: "json",
      });
      expect(result).toEqual({ response: "Test response" });
    });

    it("should handle streaming requests", async () => {
      const server = "http://test-server:11434";
      const endpoint = "/api/test";
      const method = METHOD.POST;
      const data = { model: "test-model", prompt: "Hello" };

      mockedAxios.mockResolvedValueOnce({
        data: { on: jest.fn() },
      } as AxiosResponse);

      const result = await makeRequest(server, endpoint, method, data, true);

      expect(axios).toHaveBeenCalledWith({
        method: METHOD.POST,
        url: "http://test-server:11434/api/test",
        data,
        responseType: "stream",
      });
      expect(result).toHaveProperty("on");
    });

    it("should throw error when server is not provided", async () => {
      const data: ChatOptions = {
        model: "test-model",
        messages: [{ role: "user", content: "test" }],
      };

      await expect(makeRequest("", "/api/test", METHOD.GET, data)).rejects.toThrow(
        "No server configured"
      );
    });
  });

  describe("getModels", () => {
    it("should fetch models with GET request", async () => {
      const server = "http://test-server:11434";
      const endpoint = "/api/tags";

      mockedAxiosGet.mockResolvedValueOnce({
        data: { models: [{ name: "model1", model: "model1" }] },
      } as AxiosResponse);

      const result = await getModels(server, endpoint);

      expect(axios.get).toHaveBeenCalledWith("http://test-server:11434/api/tags");
      expect(result).toEqual({ models: [{ name: "model1", model: "model1" }] });
    });

    it("should return null on error", async () => {
      mockedAxiosGet.mockRejectedValueOnce(new Error("Network error"));

      const result = await getModels("http://test-server:11434", "/api/tags");

      expect(result).toBeNull();
    });
  });

  describe("getModelInfo", () => {
    it("should fetch model info with POST request", async () => {
      const server = "http://test-server:11434";
      const endpoint = "/api/show";
      const model = "test-model";

      mockedAxiosPost.mockResolvedValueOnce({
        data: { name: "test-model", system: "You are a helpful assistant" },
      } as AxiosResponse);

      const result = await getModelInfo(server, endpoint, model);

      expect(axios.post).toHaveBeenCalledWith("http://test-server:11434/api/show", {
        name: "test-model",
      });
      expect(result).toEqual({ name: "test-model", system: "You are a helpful assistant" });
    });

    it("should return null on error", async () => {
      mockedAxiosPost.mockRejectedValueOnce(new Error("API error"));

      const result = await getModelInfo("http://test-server:11434", "/api/show", "test-model");

      expect(result).toBeNull();
    });
  });
});
