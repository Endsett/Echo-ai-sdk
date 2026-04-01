import { describe, it, expect, vi } from "vitest";
import { AwsBedrockProvider } from "../src/models/aws_bedrock";
import { GcpVertexProvider } from "../src/models/gcp_vertex";
import { AzureOpenAiProvider } from "../src/models/azure_openai";

// Mocking AWS Bedrock Client
vi.mock("@aws-sdk/client-bedrock-runtime", () => {
  return {
    BedrockRuntimeClient: vi.fn().mockImplementation(() => {
      return {
        send: async () => ({
          body: new TextEncoder().encode(JSON.stringify({
            content: [{ text: "AWS Bedrock Response" }],
            usage: { input_tokens: 10, output_tokens: 5 }
          }))
        })
      };
    }),
    InvokeModelCommand: vi.fn()
  };
});

// Mocking GCP Vertex Client
vi.mock("@google-cloud/vertexai", () => {
  return {
    VertexAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: () => ({
          generateContent: async () => ({
            response: {
              candidates: [{ content: { parts: [{ text: "GCP Vertex Response" }] } }],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
            }
          })
        })
      };
    })
  };
});

// Mocking Azure OpenAI Client
vi.mock("@azure/openai", () => {
  return {
    OpenAIClient: vi.fn().mockImplementation(() => {
      return {
        getChatCompletions: async () => ({
          choices: [{ message: { content: "Azure OpenAI Response" } }],
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        })
      };
    }),
    AzureKeyCredential: vi.fn()
  };
});

// Mock Azure Identity for Azure ML
vi.mock("@azure/identity", () => {
  return { DefaultAzureCredential: vi.fn() };
});
vi.mock("@azure/arm-machinelearning", () => {
  return { AzureMachineLearningServicesManagementClient: vi.fn() };
});

describe("Tier 5: Cloud Native Integrations", () => {
  describe("AWS Bedrock Provider", () => {
    it("should instantiate and format a chat complete request correctly", async () => {
      const provider = new AwsBedrockProvider({ region: "us-east-1" });
      const res = await provider.chatComplete({
        messages: [{ role: "user", content: "Hello" }]
      } as any);
      expect(res.content).toBe("AWS Bedrock Response");
      expect(res.provider_name).toBe("aws_bedrock");
    });
  });

  describe("GCP Vertex Provider", () => {
    it("should instantiate and generate content natively via Gemini", async () => {
      const provider = new GcpVertexProvider({ project: "test", location: "us-central1" });
      const res = await provider.chatComplete({
        messages: [{ role: "user", content: "Hello" }]
      } as any);
      expect(res.content).toBe("GCP Vertex Response");
      expect(res.provider_name).toBe("gcp_vertex");
    });
  });

  describe("Azure OpenAI Provider", () => {
    it("should instantiate and call Azure endpoints accurately", async () => {
      const provider = new AzureOpenAiProvider({ endpoint: "https://test.azure.com", apiKey: "test-key" });
      const res = await provider.chatComplete({
        messages: [{ role: "user", content: "Hello" }]
      } as any);
      expect(res.content).toBe("Azure OpenAI Response");
      expect(res.provider_name).toBe("azure_openai");
    });
  });

  describe("SageMaker Deployments", () => {
    it("should verify SageMaker endpoint creation correctly passes the instanceType value", async () => {
      const { AwsSageMakerDeployer } = await import("../src/deployment/aws_sagemaker");
      const deployer = new AwsSageMakerDeployer({ region: "us-east-1" });
      
      // Mock the send command to intercept the CreateEndpointConfigCommand
      let capturedCommand: any;
      (deployer as any).client.send = vi.fn().mockImplementation(async (cmd) => {
        if (cmd.constructor.name === "CreateEndpointConfigCommand") {
          capturedCommand = cmd;
        }
        return { EndpointStatus: "Creating" }; // Returns dummy response
      });

      await deployer.deployEndpoint({
        modelName: "test-model",
        primaryContainerImage: "test-image",
        executionRoleArn: "arn:aws:iam::123:role/test",
        instanceType: "ml.p3.2xlarge"
      });

      expect(capturedCommand).toBeDefined();
      expect(capturedCommand.input.ProductionVariants[0].InstanceType).toBe("ml.p3.2xlarge");
    });
  });
});
