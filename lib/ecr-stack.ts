import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { Context } from './common/context'

export class EcrStack extends cdk.Stack {
    public readonly frontendRepository: ecr.Repository

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // ECR
        this.frontendRepository = new ecr.Repository(this, 'FrontendRepository', {
            repositoryName: `${Context.USER_NAME}-ecsdemo-frontend`,
            imageScanOnPush: true,
        })
    }
}
