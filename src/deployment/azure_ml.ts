import { AzureMachineLearningServicesManagementClient } from "@azure/arm-machinelearning";
import { DefaultAzureCredential } from "@azure/identity";

export interface AzureMlConfig {
  subscriptionId: string;
  resourceGroupName: string;
  workspaceName: string;
}

export interface AzureMlDeployParams {
  endpointName: string;
  deploymentName: string;
  modelId: string; // ARM Resource ID of a registered model in the Azure ML Workspace
  instanceType?: string; // e.g. "Standard_DS3_v2"
  instanceCount?: number;
}

/**
 * Enterprise deployer for creating Managed Online Endpoints in Azure Machine Learning.
 */
export class AzureMlDeployer {
  private client: AzureMachineLearningServicesManagementClient;
  private config: AzureMlConfig;

  constructor(config: AzureMlConfig) {
    // Authenticate using DefaultAzureCredential (Environment variables, Managed Identity, Azure CLI, etc.)
    const credential = new DefaultAzureCredential();
    this.client = new AzureMachineLearningServicesManagementClient(credential, config.subscriptionId);
    this.config = config;
  }

  /**
   * Orchestrates the creation of an Azure Managed Online Endpoint and Deployment.
   */
  async deployEndpoint(params: AzureMlDeployParams): Promise<string> {
    const { resourceGroupName, workspaceName } = this.config;

    try {
      // 1. Create the Online Endpoint
      const endpointLro = await this.client.onlineEndpoints.beginCreateOrUpdateAndWait(
        resourceGroupName,
        workspaceName,
        params.endpointName,
        {
          location: "eastus", // Would ideally be dynamic based on workspace location
          properties: {
            authMode: "Key",
            compute: "Managed"
          }
        }
      );

      // 2. Create the Deployment tied to the Endpoint
      await this.client.onlineDeployments.beginCreateOrUpdateAndWait(
        resourceGroupName,
        workspaceName,
        params.endpointName,
        params.deploymentName,
        {
          location: endpointLro.location,
          properties: {
            endpointComputeType: "Managed",
            model: params.modelId,
            instanceType: params.instanceType || "Standard_DS3_v2",
            scaleSettings: {
              scaleType: "Default",
              instanceCount: Math.max(1, params.instanceCount || 1)
            } as any
          }
        }
      );

      // 3. Update Endpoint traffic routing to 100% on the new deployment
      await this.client.onlineEndpoints.beginCreateOrUpdateAndWait(
        resourceGroupName,
        workspaceName,
        params.endpointName,
        {
          location: endpointLro.location,
          properties: {
            authMode: "Key",
            compute: "Managed",
            traffic: {
              [params.deploymentName]: 100
            }
          }
        }
      );

      return params.endpointName;
    } catch (e: any) {
      throw new Error(`Azure ML Deployment failed: ${e.message}`);
    }
  }

  /**
   * Retrieves the current provisioning state of an Azure ML Endpoint.
   */
  async getEndpointStatus(endpointName: string): Promise<string> {
    const endpoint = await this.client.onlineEndpoints.get(
      this.config.resourceGroupName,
      this.config.workspaceName,
      endpointName
    );
    return endpoint.properties?.provisioningState || "Unknown";
  }
}
