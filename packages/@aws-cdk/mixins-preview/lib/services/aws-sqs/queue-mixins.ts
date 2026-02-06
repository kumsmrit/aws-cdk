import type { IConstruct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Duration } from 'aws-cdk-lib/core';
import { CfnResource, CfnDeletionPolicy } from 'aws-cdk-lib/core';
import type { IMixin } from '../../core';

/**
 * What kind of encryption to apply to this queue
 */
export enum QueueEncryption {
  /**
   * Messages in the queue are not encrypted
   */
  UNENCRYPTED = 'NONE',

  /**
   * Server-side KMS encryption with a KMS key managed by SQS.
   */
  KMS_MANAGED = 'KMS_MANAGED',

  /**
   * Server-side encryption with a KMS key managed by the user.
   *
   * If `encryptionKey` is specified, this key will be used, otherwise, one will be defined.
   */
  KMS = 'KMS',

  /**
   * Server-side encryption key managed by SQS (SSE-SQS).
   */
  SQS_MANAGED = 'SQS_MANAGED',
}

/**
 * Properties for the encryption mixin
 */
export interface EncryptionMixinProps {
  /**
   * Whether the contents of the queue are encrypted, and by what type of key.
   *
   * Be aware that encryption is not available in all regions, please see the docs
   * for current availability details.
   *
   * @default QueueEncryption.SQS_MANAGED
   */
  readonly encryption?: QueueEncryption;

  /**
   * External KMS key to use for queue encryption.
   *
   * Individual messages will be encrypted using data keys. The data keys in
   * turn will be encrypted using this key, and reused for a maximum of
   * `dataKeyReuse` seconds.
   *
   * If the 'encryptionMasterKey' property is set, 'encryption' type will be
   * implicitly set to "KMS".
   *
   * @default - If encryption is set to KMS and not specified, a key will be created.
   */
  readonly encryptionMasterKey?: kms.IKey;

  /**
   * The length of time that Amazon SQS reuses a data key before calling KMS again.
   *
   * The value must be an integer between 60 (1 minute) and 86,400 (24
   * hours). The default is 300 (5 minutes).
   *
   * @default Duration.minutes(5)
   */
  readonly dataKeyReuse?: Duration;
}

/**
 * Mixin for queue encryption configuration.
 *
 * Configures server-side encryption for queue messages using either
 * SQS-managed keys (SSE-SQS) or customer-managed KMS keys (SSE-KMS).
 *
 * @mixin true
 */
export class EncryptionMixin implements IMixin {
  /**
   * The encryption properties for this mixin
   */
  private readonly props: EncryptionMixinProps;

  /**
   * Creates a new EncryptionMixin
   * @param props - The encryption properties
   */
  constructor(props: EncryptionMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies encryption configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    const queue = construct as sqs.CfnQueue;
    let encryption = this.props.encryption;

    // If encryptionMasterKey is provided, implicitly set encryption to KMS
    if (this.props.encryptionMasterKey && encryption !== QueueEncryption.KMS) {
      encryption = QueueEncryption.KMS;
    }

    if (!encryption) {
      return;
    }

    switch (encryption) {
      case QueueEncryption.UNENCRYPTED:
        queue.sqsManagedSseEnabled = false;
        break;

      case QueueEncryption.KMS_MANAGED:
        queue.kmsMasterKeyId = 'alias/aws/sqs';
        if (this.props.dataKeyReuse) {
          queue.kmsDataKeyReusePeriodSeconds = this.props.dataKeyReuse.toSeconds();
        }
        break;

      case QueueEncryption.KMS:
        if (this.props.encryptionMasterKey) {
          queue.kmsMasterKeyId = this.props.encryptionMasterKey.keyArn;
        }
        if (this.props.dataKeyReuse) {
          queue.kmsDataKeyReusePeriodSeconds = this.props.dataKeyReuse.toSeconds();
        }
        break;

      case QueueEncryption.SQS_MANAGED:
        queue.sqsManagedSseEnabled = true;
        break;
    }
  }
}

/**
 * What kind of deduplication scope to apply
 */
export enum DeduplicationScope {
  /**
   * Deduplication occurs at the message group level
   */
  MESSAGE_GROUP = 'messageGroup',
  /**
   * Deduplication occurs at the message queue level
   */
  QUEUE = 'queue',
}

/**
 * Whether the FIFO queue throughput quota applies to the entire queue or per message group
 */
export enum FifoThroughputLimit {
  /**
   * Throughput quota applies per queue
   */
  PER_QUEUE = 'perQueue',
  /**
   * Throughput quota applies per message group id
   */
  PER_MESSAGE_GROUP_ID = 'perMessageGroupId',
}

/**
 * Properties for the FIFO mixin
 */
export interface FifoMixinProps {
  /**
   * Whether this is a first-in-first-out (FIFO) queue.
   *
   * @default false
   */
  readonly fifo?: boolean;

  /**
   * Specifies whether to enable content-based deduplication.
   *
   * During the deduplication interval (5 minutes), Amazon SQS treats
   * messages that are sent with identical content (excluding attributes) as
   * duplicates and delivers only one copy of the message.
   *
   * If you don't enable content-based deduplication and you want to deduplicate
   * messages, provide an explicit deduplication ID in your SendMessage() call.
   *
   * (Only applies to FIFO queues.)
   *
   * @default false
   */
  readonly contentBasedDeduplication?: boolean;

  /**
   * For high throughput for FIFO queues, specifies whether message deduplication
   * occurs at the message group or queue level.
   *
   * (Only applies to FIFO queues.)
   *
   * @default DeduplicationScope.QUEUE
   */
  readonly deduplicationScope?: DeduplicationScope;

  /**
   * For high throughput for FIFO queues, specifies whether the FIFO queue
   * throughput quota applies to the entire queue or per message group.
   *
   * (Only applies to FIFO queues.)
   *
   * @default FifoThroughputLimit.PER_QUEUE
   */
  readonly fifoThroughputLimit?: FifoThroughputLimit;
}

/**
 * Mixin for FIFO queue configuration.
 *
 * Configures the queue as a FIFO (first-in-first-out) queue with
 * support for content-based deduplication and high throughput settings.
 *
 * @mixin true
 */
export class FifoMixin implements IMixin {
  /**
   * The FIFO properties for this mixin
   */
  private readonly props: FifoMixinProps;

  /**
   * Creates a new FifoMixin
   * @param props - The FIFO properties
   */
  constructor(props: FifoMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies FIFO configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    const queue = construct as sqs.CfnQueue;

    // Only set fifoQueue to true, never false (CloudFormation doesn't accept false)
    if (this.props.fifo) {
      queue.fifoQueue = true;
    }

    if (this.props.contentBasedDeduplication !== undefined) {
      queue.contentBasedDeduplication = this.props.contentBasedDeduplication;
    }

    if (this.props.deduplicationScope !== undefined) {
      queue.deduplicationScope = this.props.deduplicationScope;
    }

    if (this.props.fifoThroughputLimit !== undefined) {
      queue.fifoThroughputLimit = this.props.fifoThroughputLimit;
    }
  }
}

/**
 * Represents an SQS queue that can be used as a dead-letter queue
 */
export interface IQueue {
  /**
   * The ARN of this queue
   */
  readonly queueArn: string;
}

/**
 * Dead letter queue settings
 */
export interface DeadLetterQueue {
  /**
   * The dead-letter queue to which Amazon SQS moves messages after the value of maxReceiveCount is exceeded.
   */
  readonly queue: IQueue;

  /**
   * The number of times a message can be unsuccessfully dequeued before being moved to the dead-letter queue.
   */
  readonly maxReceiveCount: number;
}

/**
 * The permission type that defines which source queues can specify the current queue as the dead-letter queue
 */
export enum RedrivePermission {
  /**
   * Any source queues in this AWS account in the same Region can specify this queue as the dead-letter queue
   */
  ALLOW_ALL = 'allowAll',
  /**
   * No source queues can specify this queue as the dead-letter queue
   */
  DENY_ALL = 'denyAll',
  /**
   * Only queues specified by the `sourceQueues` parameter can specify this queue as the dead-letter queue
   */
  BY_QUEUE = 'byQueue',
}

/**
 * Permission settings for the dead letter source queue
 */
export interface RedriveAllowPolicy {
  /**
   * Permission settings for source queues that can designate this queue as their dead-letter queue.
   *
   * @default - `RedrivePermission.BY_QUEUE` if `sourceQueues` is specified, `RedrivePermission.ALLOW_ALL` otherwise.
   */
  readonly redrivePermission?: RedrivePermission;

  /**
   * Source queues that can designate this queue as their dead-letter queue.
   *
   * When `redrivePermission` is set to `RedrivePermission.BY_QUEUE`, this parameter is required.
   *
   * You can specify up to 10 source queues.
   * To allow more than 10 source queues to specify dead-letter queues, set the `redrivePermission` to
   * `RedrivePermission.ALLOW_ALL`.
   *
   * When `redrivePermission` is either `RedrivePermission.ALLOW_ALL` or `RedrivePermission.DENY_ALL`,
   * this parameter cannot be set.
   *
   * @default - Required when `redrivePermission` is `RedrivePermission.BY_QUEUE`, cannot be defined otherwise.
   */
  readonly sourceQueues?: IQueue[];
}

/**
 * Properties for the dead letter queue mixin
 */
export interface DeadLetterQueueMixinProps {
  /**
   * Send messages to this queue if they were unsuccessfully dequeued a number of times.
   *
   * @default - no dead-letter queue
   */
  readonly deadLetterQueue?: DeadLetterQueue;

  /**
   * The string that includes the parameters for the permissions for the dead-letter queue
   * redrive permission and which source queues can specify dead-letter queues.
   *
   * @default - All source queues can designate this queue as their dead-letter queue.
   */
  readonly redriveAllowPolicy?: RedriveAllowPolicy;
}

/**
 * Mixin for dead letter queue configuration.
 *
 * Configures dead-letter queue settings for failed message processing,
 * including the target DLQ and redrive permissions.
 *
 * @mixin true
 */
export class DeadLetterQueueMixin implements IMixin {
  /**
   * The dead letter queue properties for this mixin
   */
  private readonly props: DeadLetterQueueMixinProps;

  /**
   * Creates a new DeadLetterQueueMixin
   * @param props - The dead letter queue properties
   */
  constructor(props: DeadLetterQueueMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies dead letter queue configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    const queue = construct as sqs.CfnQueue;

    // Configure redrive policy (dead letter queue target)
    if (this.props.deadLetterQueue) {
      queue.redrivePolicy = {
        deadLetterTargetArn: this.props.deadLetterQueue.queue.queueArn,
        maxReceiveCount: this.props.deadLetterQueue.maxReceiveCount,
      };
    }

    // Configure redrive allow policy (which queues can use this as DLQ)
    if (this.props.redriveAllowPolicy) {
      const redrivePermission = this.props.redriveAllowPolicy.redrivePermission
        ?? (this.props.redriveAllowPolicy.sourceQueues ? RedrivePermission.BY_QUEUE : RedrivePermission.ALLOW_ALL);

      queue.redriveAllowPolicy = {
        redrivePermission,
        sourceQueueArns: this.props.redriveAllowPolicy.sourceQueues?.map(q => q.queueArn),
      };
    }
  }
}

/**
 * Properties for the message configuration mixin
 */
export interface MessageConfigurationMixinProps {
  /**
   * The number of seconds that Amazon SQS retains a message.
   *
   * You can specify an integer value from 60 seconds (1 minute) to 1209600
   * seconds (14 days). The default value is 345600 seconds (4 days).
   *
   * @default Duration.days(4)
   */
  readonly retentionPeriod?: Duration;

  /**
   * The time in seconds that the delivery of all messages in the queue is delayed.
   *
   * You can specify an integer value of 0 to 900 (15 minutes). The default
   * value is 0.
   *
   * @default Duration.seconds(0)
   */
  readonly deliveryDelay?: Duration;

  /**
   * The limit of how many bytes that a message can contain before Amazon SQS rejects it.
   *
   * You can specify an integer value from 1024 bytes (1 KiB) to 1048576 bytes
   * (1 MiB). The default value is 1048576 (1 MiB).
   *
   * @default 1048576 (1 MiB)
   */
  readonly maxMessageSizeBytes?: number;

  /**
   * Timeout of processing a single message.
   *
   * After dequeuing, the processor has this much time to handle the message
   * and delete it from the queue before it becomes visible again for dequeueing
   * by another processor.
   *
   * Values must be from 0 to 43200 seconds (12 hours). If you don't specify
   * a value, AWS CloudFormation uses the default value of 30 seconds.
   *
   * @default Duration.seconds(30)
   */
  readonly visibilityTimeout?: Duration;

  /**
   * Default wait time for ReceiveMessage calls.
   *
   * Does not wait if set to 0, otherwise waits this amount of seconds
   * by default for messages to arrive.
   *
   * For more information, see Amazon SQS Long Poll.
   *
   * @default Duration.seconds(0)
   */
  readonly receiveMessageWaitTime?: Duration;
}

/**
 * Mixin for message configuration.
 *
 * Configures message timing and size settings including retention period,
 * delivery delay, maximum message size, visibility timeout, and long polling.
 *
 * @mixin true
 */
export class MessageConfigurationMixin implements IMixin {
  /**
   * The message configuration properties for this mixin
   */
  private readonly props: MessageConfigurationMixinProps;

  /**
   * Creates a new MessageConfigurationMixin
   * @param props - The message configuration properties
   */
  constructor(props: MessageConfigurationMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies message configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    const queue = construct as sqs.CfnQueue;

    if (this.props.retentionPeriod !== undefined) {
      queue.messageRetentionPeriod = this.props.retentionPeriod.toSeconds();
    }

    if (this.props.deliveryDelay !== undefined) {
      queue.delaySeconds = this.props.deliveryDelay.toSeconds();
    }

    if (this.props.maxMessageSizeBytes !== undefined) {
      queue.maximumMessageSize = this.props.maxMessageSizeBytes;
    }

    if (this.props.visibilityTimeout !== undefined) {
      queue.visibilityTimeout = this.props.visibilityTimeout.toSeconds();
    }

    if (this.props.receiveMessageWaitTime !== undefined) {
      queue.receiveMessageWaitTimeSeconds = this.props.receiveMessageWaitTime.toSeconds();
    }
  }
}

/**
 * Properties for the security mixin
 */
export interface SecurityMixinProps {
  /**
   * Enforce encryption of data in transit.
   *
   * When enabled, adds a resource policy that denies any requests
   * that don't use HTTPS/TLS.
   *
   * @see https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-security-best-practices.html#enforce-encryption-data-in-transit
   * @default false
   */
  readonly enforceSSL?: boolean;
}

/**
 * Mixin for queue security configuration.
 *
 * Configures transport security settings including SSL/TLS enforcement
 * for data in transit.
 *
 * @mixin true
 */
export class SecurityMixin implements IMixin {
  /**
   * The security properties for this mixin
   */
  private readonly props: SecurityMixinProps;

  /**
   * Creates a new SecurityMixin
   * @param props - The security properties
   */
  constructor(props: SecurityMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies security configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    if (!this.props.enforceSSL) {
      return;
    }

    const queue = construct as sqs.CfnQueue;

    // Create a CfnQueuePolicy to enforce SSL
    const policyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: 'EnforceSSL',
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: ['sqs:*'],
          resources: ['*'],
          conditions: {
            Bool: { 'aws:SecureTransport': 'false' },
          },
        }),
      ],
    });

    // Create the queue policy resource as a sibling
    new sqs.CfnQueuePolicy(queue, 'Policy', {
      queues: [queue.ref],
      policyDocument: policyDocument.toJSON(),
    });
  }
}

/**
 * Possible values for a resource's Removal Policy
 *
 * The removal policy controls what happens to the resource if it stops being
 * managed by CloudFormation.
 */
export enum RemovalPolicy {
  /**
   * This is the default removal policy. It means that when the resource is
   * removed from the app, it will be physically destroyed.
   */
  DESTROY = 'destroy',

  /**
   * This uses the 'Retain' DeletionPolicy, which will cause the resource to be retained
   * in the account, but orphaned from the stack.
   */
  RETAIN = 'retain',

  /**
   * This retention policy deletes the resource,
   * but saves a snapshot of its data before deleting, so that it can be re-created later.
   * Only available for some stateful resources, like databases, EC2 volumes, etc.
   *
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html#aws-attribute-deletionpolicy-options
   */
  SNAPSHOT = 'snapshot',

  /**
   * Resource will be retained when they are removed from a stack or replaced during an update.
   *
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html#aws-attribute-deletionpolicy-options
   */
  RETAIN_ON_UPDATE_OR_DELETE = 'retain-on-update-or-delete',
}

/**
 * Properties for the lifecycle mixin
 */
export interface LifecycleMixinProps {
  /**
   * Policy to apply when the queue is removed from the stack.
   *
   * Even though queues are technically stateful resources, their data is transient
   * by nature, so DESTROY is the default (and recommended) setting.
   *
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * A name for the queue.
   *
   * If specified and this is a FIFO queue, must end in the string '.fifo'.
   *
   * @default - CloudFormation-generated name
   */
  readonly queueName?: string;
}

/**
 * Mixin for queue lifecycle configuration.
 *
 * Configures resource lifecycle settings including removal policy
 * and queue naming.
 *
 * @mixin true
 */
export class LifecycleMixin implements IMixin {
  /**
   * The lifecycle properties for this mixin
   */
  private readonly props: LifecycleMixinProps;

  /**
   * Creates a new LifecycleMixin
   * @param props - The lifecycle properties
   */
  constructor(props: LifecycleMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies lifecycle configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    const queue = construct as sqs.CfnQueue;

    if (this.props.queueName !== undefined) {
      queue.queueName = this.props.queueName;
    }

    if (this.props.removalPolicy !== undefined) {
      switch (this.props.removalPolicy) {
        case RemovalPolicy.DESTROY:
          queue.cfnOptions.deletionPolicy = CfnDeletionPolicy.DELETE;
          queue.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.DELETE;
          break;
        case RemovalPolicy.RETAIN:
          queue.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN;
          queue.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.RETAIN;
          break;
        case RemovalPolicy.SNAPSHOT:
          queue.cfnOptions.deletionPolicy = CfnDeletionPolicy.SNAPSHOT;
          queue.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.SNAPSHOT;
          break;
        case RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE:
          queue.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN_EXCEPT_ON_CREATE;
          queue.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.RETAIN;
          break;
      }
    }
  }
}

/**
 * Properties for the tagging mixin
 */
export interface TaggingMixinProps {
  /**
   * Tags to apply to the queue.
   *
   * Tags are key-value pairs that you can use to categorize and manage
   * your resources in various ways, such as by purpose, owner, or environment.
   *
   * @default - No tags
   */
  readonly tags?: { [key: string]: string };
}

/**
 * Mixin for queue tagging configuration.
 *
 * Configures resource tags for the queue to help with organization,
 * cost allocation, and access control.
 *
 * @mixin true
 */
export class TaggingMixin implements IMixin {
  /**
   * The tagging properties for this mixin
   */
  private readonly props: TaggingMixinProps;

  /**
   * Creates a new TaggingMixin
   * @param props - The tagging properties
   */
  constructor(props: TaggingMixinProps) {
    this.props = props;
  }

  /**
   * Check if this mixin supports the given construct
   * @param construct - The construct to check
   * @returns true if the construct is a CfnQueue
   */
  public supports(construct: IConstruct): construct is sqs.CfnQueue {
    return CfnResource.isCfnResource(construct) && construct.cfnResourceType === sqs.CfnQueue.CFN_RESOURCE_TYPE_NAME;
  }

  /**
   * Applies tagging configuration to the queue
   * @param construct - The CfnQueue resource to configure
   */
  public applyTo(construct: IConstruct): void {
    if (!this.props.tags) {
      return;
    }

    const queue = construct as sqs.CfnQueue;

    // Convert tags object to CfnTag array format
    const cfnTags = Object.entries(this.props.tags).map(([key, value]) => ({
      key,
      value,
    }));

    // Merge with existing tags or set new ones
    if (queue.tagsRaw) {
      queue.tagsRaw = [...queue.tagsRaw, ...cfnTags];
    } else {
      queue.tagsRaw = cfnTags;
    }
  }
}
