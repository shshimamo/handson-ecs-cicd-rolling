#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { FrontendServiceStack } from '../lib/frontend-service-stack';
import { Context } from '../lib/common/context'
import { BackendServiceCrystalStack } from "../lib/backend-service-crystal-stack";
import { BackendServiceNodejsStack } from "../lib/backend-service-nodejs-stack";
import { EcrStack } from "../lib/ecr-stack";
import {FrontendPipelineStack} from "../lib/frontend-pipeline-stack";

const app = new cdk.App();

new EcrStack(app, `${Context.ID_PREFIX}-EcrStack`, {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

const infra = new InfrastructureStack(app, `${Context.ID_PREFIX}-InfrastructureStack`, {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

const frontendService = new FrontendServiceStack(app, `${Context.ID_PREFIX}-FrontendServiceStack`, {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
    cluster: infra.cluster,
    frontendServiceSG: infra.frontendServiceSG,
    frontendTaskRole: infra.frontendTaskRole,
    frontendTaskExecutionRole: infra.TaskExecutionRole,
    frontendLogGroup: infra.frontendLogGroup,
    cloudmapNamespace: infra.cloudmapNamespace,
    blueTargetGroup: infra.blueTargetGroup,
    greenTargetGroup: infra.greenTargetGroup,
    frontListener: infra.frontListener,
    frontTestListener: infra.frontTestListener,
});

new BackendServiceCrystalStack(app, `${Context.ID_PREFIX}-BackendServiceCrystalStack`, {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
    cluster: infra.cluster,
    backendServiceSG: infra.backendServiceSG,
    backendTaskRole: infra.backendCrystalTaskRole,
    backendTaskExecutionRole: infra.TaskExecutionRole,
    backendLogGroup: infra.backendCrystalLogGroup,
    cloudmapNamespace: infra.cloudmapNamespace,
});

new BackendServiceNodejsStack(app, `${Context.ID_PREFIX}-BackendServiceNodejsStack`, {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
    cluster: infra.cluster,
    backendServiceSG: infra.backendServiceSG,
    backendTaskRole: infra.backendNodejsTaskRole,
    backendTaskExecutionRole: infra.TaskExecutionRole,
    backendLogGroup: infra.backendNodejsLogGroup,
    cloudmapNamespace: infra.cloudmapNamespace,
});

new FrontendPipelineStack(app, `${Context.ID_PREFIX}-FrontendPipelineStack`, {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
    ecsDeploymentGroup: frontendService.ecsDeploymentGroup,
    buildProjectLogGroup: infra.frontendBuildProjectLogGroup
})