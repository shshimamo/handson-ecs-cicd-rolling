import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Context } from './common/context'

interface FrontendPipelineStackProps extends cdk.StackProps {
    ecsDeploymentGroup: codedeploy.EcsDeploymentGroup,
    buildProjectLogGroup: logs.LogGroup
}

export class FrontendPipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: FrontendPipelineStackProps) {
        super(scope, id, props);

        // パイプライン
        const pipeline = new codepipeline.Pipeline(this, 'FrontendPipeline');

        // Source アクション
        const sourceOutput = new codepipeline.Artifact();
        const sourceAction = new codepipeline_actions.GitHubSourceAction ({
            actionName: 'GitHub_Source',
            owner: 'shshimamo',
            repo: 'handsonuser-ecsdemo-frontend',
            branch: 'main',
            oauthToken: cdk.SecretValue.secretsManager('my-github-token'),
            trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
            output: sourceOutput,
        });
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // ビルドプロジェクト
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            projectName: `${Context.ID_PREFIX}-frontend-build`,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
                privileged: true,
            },
            logging: {
                cloudWatch: {
                    logGroup: props.buildProjectLogGroup,
                }
            }
        });
        buildProject.addToRolePolicy(
            new iam.PolicyStatement({
                resources: ['*'],
                actions: ["ecr:GetAuthorizationToken",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:GetRepositoryPolicy",
                    "ecr:DescribeRepositories",
                    "ecr:ListImages",
                    "ecr:DescribeImages",
                    "ecr:BatchGetImage",
                    "ecr:GetLifecyclePolicy",
                    "ecr:GetLifecyclePolicyPreview",
                    "ecr:ListTagsForResource",
                    "ecr:DescribeImageScanFindings",
                    "ecr:InitiateLayerUpload",
                    "ecr:UploadLayerPart",
                    "ecr:CompleteLayerUpload",
                    "ecr:PutImage"]
            })
        )
        // ビルドアクション
        const buildOutput = new codepipeline.Artifact();
        const buildAction = new codepipeline_actions.CodeBuildAction({
            actionName: `${Context.ID_PREFIX}-frontend-build`,
            project: buildProject,
            input: sourceOutput,
            outputs: [buildOutput]
        });
        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });

        // デプロイアクション
        const deployAction = new codepipeline_actions.CodeDeployEcsDeployAction({
            actionName: `${Context.ID_PREFIX}-frontend-deploy`,
            deploymentGroup: props.ecsDeploymentGroup,

            // the properties below are optional
            taskDefinitionTemplateInput: sourceOutput, // タスク定義
            appSpecTemplateInput: sourceOutput, // AppSpecファイル
            containerImageInputs: [{
                input: buildOutput,

                // the properties below are optional
                taskDefinitionPlaceholder: 'IMAGE1_NAME',
            }],
            variablesNamespace: 'DeployVariables'
        })
        pipeline.addStage({
            stageName: 'Deploy',
            actions: [deployAction],
        });
    }
}