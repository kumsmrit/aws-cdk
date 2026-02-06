import type { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Duration } from 'aws-cdk-lib/core';
import { Resource, Stack, Token, ArnFormat } from 'aws-cdk-lib/core';
import { ValidationError } from 'aws-cdk-lib/core/lib/errors';
import type { IQueueRef, QueueReference } from 'aws-cdk-lib/aws-sqs';
import { Mixins } from '../../core';
import {
  EncryptionMixin,
  FifoMixin,
  DeadLetterQueueMixin,
  MessageConfigurationMixin,
  SecurityMixin,
  LifecycleMixin,
  TaggingMixin,
  QueueEncryption,
  DeduplicationScope,
  FifoThroughputLimit,
  RedrivePermission,
  RemovalPolicy,
} from './queue-mixins';
import type {
  DeadLetterQueue,
  RedriveAllowPolicy,
} from './queue-mixins';

// Re-export types from queue-mixins for convenience
export {
  QueueEncryption,
  DeduplicationScope,
  FifoThroughputLimit,
  RedrivePermission,
  RemovalPolicy,
};
export type { DeadLetterQueue, RedriveAllowPolicy };

/**
 * Represents an SQS queue
 */
export interface IQueue2 extends IQueueRef {
  /**
   * The ARN of this queue
   * @attribute
   */
  readonly queueArn: string;

  /**
   * The URL of this queue
   * @attribute
   */
  readonly queueUrl: string;

  /**
   * The name of this queue
   * @attribute
   */
  readonly queueName: string;

  /**
   * If this queue is server-side encrypted, this is the KMS encryption key.
   */
  readonly encryptionMasterKey?: kms.IKey;

  /**
   * Whether this queue is an Amazon SQS FIFO queue. If false, this is a standard queue.
   */
  readonly fifo: boolean;

  /**
   * Whether the contents of the queue are encrypted, and by what type of key.
   */
  readonly encryptionType?: QueueEncryption;

  /**
   * Grant permissions on this queue
   */
  readonly grants: Queue2Grants;

  /**
   * Adds a statement to the IAM resource policy associated with this queue.
   */
  addToResourcePolicy(statement: iam.PolicyStatement): iam.AddToResourcePolicyResult;
}

/**
 * Reference to a queue
 */
export interface Queue2Attributes {
  /**
   * The ARN of the queue.
   */
  readonly queueArn: string;

  /**
   * The URL of the queue.
   * @default - 'https://sqs.<region-endpoint>/<account-ID>/<queue-name>'
   */
  readonly queueUrl?: string;

  /**
   * The name of the queue.
   * @default - if queue name is not specified, the name will be derived from the queue ARN
   */
  readonly queueName?: string;

  /**
   * KMS encryption key, if this queue is server-side encrypted by a KMS key.
   * @default - None
   */
  readonly keyArn?: string;

  /**
   * Whether this queue is an Amazon SQS FIFO queue. If false, this is a standard queue.
   * @default - if fifo is not specified, the property will be determined based on the queue name
   */
  readonly fifo?: boolean;
}

/**
 * Properties for creating a new Queue2
 */
export interface Queue2Props {
  /**
   * A name for the queue.
   *
   * If specified and this is a FIFO queue, must end in the string '.fifo'.
   *
   * @default - CloudFormation-generated name
   */
  readonly queueName?: string;

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
   * You can specify an integer value of 0 to 900 (15 minutes).
   *
   * @default Duration.seconds(0)
   */
  readonly deliveryDelay?: Duration;

  /**
   * The limit of how many bytes that a message can contain before Amazon SQS rejects it.
   *
   * You can specify an integer value from 1024 bytes (1 KiB) to 262144 bytes (256 KiB).
   *
   * @default 262144 (256 KiB)
   */
  readonly maxMessageSizeBytes?: number;

  /**
   * Default wait time for ReceiveMessage calls.
   *
   * Does not wait if set to 0, otherwise waits this amount of seconds
   * by default for messages to arrive.
   *
   * @default Duration.seconds(0)
   */
  readonly receiveMessageWaitTime?: Duration;

  /**
   * Timeout of processing a single message.
   *
   * After dequeuing, the processor has this much time to handle the message
   * and delete it from the queue before it becomes visible again for dequeueing
   * by another processor.
   *
   * @default Duration.seconds(30)
   */
  readonly visibilityTimeout?: Duration;

  /**
   * Whether the contents of the queue are encrypted, and by what type of key.
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
   * @default - If encryption is set to KMS and not specified, a key will be created.
   */
  readonly encryptionMasterKey?: kms.IKey;

  /**
   * The length of time that Amazon SQS reuses a data key before calling KMS again.
   *
   * The value must be an integer between 60 (1 minute) and 86,400 (24 hours).
   *
   * @default Duration.minutes(5)
   */
  readonly dataKeyReuse?: Duration;

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
   * messages that are sent with identical content as duplicates and
   * delivers only one copy of the message.
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

  /**
   * Enforce encryption of data in transit.
   *
   * @default false
   */
  readonly enforceSSL?: boolean;

  /**
   * Policy to apply when the queue is removed from the stack.
   *
   * @default RemovalPolicy.DESTROY
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Tags to apply to the queue.
   *
   * @default - No tags
   */
  readonly tags?: { [key: string]: string };
}

/**
 * Grants class for Queue2 permissions.
 *
 * This class provides methods to grant IAM permissions on an SQS queue.
 * Use the static `of()` method to create an instance from any queue reference.
 */
export class Queue2Grants {
  /**
   * Creates a Queue2Grants instance from a queue reference.
   * @param queue - The queue reference
   */
  public static of(queue: IQueueRef & { encryptionMasterKey?: kms.IKey }): Queue2Grants {
    return new Queue2Grants(queue);
  }

  private readonly queue: IQueueRef & { encryptionMasterKey?: kms.IKey };

  private constructor(queue: IQueueRef & { encryptionMasterKey?: kms.IKey }) {
    this.queue = queue;
  }

  /**
   * Grant permissions to consume messages from a queue.
   *
   * This will grant the following permissions:
   *   - sqs:ChangeMessageVisibility
   *   - sqs:DeleteMessage
   *   - sqs:ReceiveMessage
   *   - sqs:GetQueueAttributes
   *   - sqs:GetQueueUrl
   *
   * If encryption is used, permission to use the key to decrypt the contents
   * of the queue will also be granted.
   *
   * @param grantee - Principal to grant consume rights to
   */
  public consumeMessages(grantee: iam.IGrantable): iam.Grant {
    const ret = iam.Grant.addToPrincipal({
      grantee,
      actions: [
        'sqs:ChangeMessageVisibility',
        'sqs:DeleteMessage',
        'sqs:ReceiveMessage',
        'sqs:GetQueueAttributes',
        'sqs:GetQueueUrl',
      ],
      resourceArns: [this.queue.queueRef.queueArn],
    });

    if (this.queue.encryptionMasterKey) {
      this.queue.encryptionMasterKey.grant(grantee, 'kms:Decrypt');
    }

    return ret;
  }

  /**
   * Grant access to send messages to a queue to the given identity.
   *
   * This will grant the following permissions:
   *   - sqs:SendMessage
   *   - sqs:GetQueueAttributes
   *   - sqs:GetQueueUrl
   *
   * If encryption is used, permission to use the key to encrypt/decrypt
   * the contents of the queue will also be granted.
   *
   * @param grantee - Principal to grant send rights to
   */
  public sendMessages(grantee: iam.IGrantable): iam.Grant {
    const ret = iam.Grant.addToPrincipal({
      grantee,
      actions: [
        'sqs:SendMessage',
        'sqs:GetQueueAttributes',
        'sqs:GetQueueUrl',
      ],
      resourceArns: [this.queue.queueRef.queueArn],
    });

    if (this.queue.encryptionMasterKey) {
      this.queue.encryptionMasterKey.grant(
        grantee,
        'kms:Decrypt',
        'kms:Encrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
      );
    }

    return ret;
  }

  /**
   * Grant an IAM principal permissions to purge all messages from the queue.
   *
   * This will grant the following permissions:
   *   - sqs:PurgeQueue
   *   - sqs:GetQueueAttributes
   *   - sqs:GetQueueUrl
   *
   * @param grantee - Principal to grant purge rights to
   */
  public purge(grantee: iam.IGrantable): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee,
      actions: [
        'sqs:PurgeQueue',
        'sqs:GetQueueAttributes',
        'sqs:GetQueueUrl',
      ],
      resourceArns: [this.queue.queueRef.queueArn],
    });
  }

  /**
   * Grant the actions defined in queueActions to the identity Principal given
   * on this SQS queue resource.
   *
   * @param grantee - Principal to grant right to
   * @param actions - The actions to grant
   */
  public actions(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee,
      actions,
      resourceArns: [this.queue.queueRef.queueArn],
    });
  }
}

/**
 * A new Amazon SQS queue
 */
export class Queue2 extends Resource implements IQueue2 {
  /**
   * Import an existing SQS queue provided an ARN
   *
   * @param scope The parent creating construct
   * @param id The construct's name
   * @param queueArn queue ARN (i.e. arn:aws:sqs:us-east-2:444455556666:queue1)
   */
  public static fromQueueArn(scope: Construct, id: string, queueArn: string): IQueue2 {
    return Queue2.fromQueueAttributes(scope, id, { queueArn });
  }

  /**
   * Import an existing queue from its attributes
   */
  public static fromQueueAttributes(scope: Construct, id: string, attrs: Queue2Attributes): IQueue2 {
    const stack = Stack.of(scope);
    const parsedArn = stack.splitArn(attrs.queueArn, ArnFormat.NO_RESOURCE_NAME);
    const queueName = attrs.queueName ?? parsedArn.resource;
    const queueUrl = attrs.queueUrl ?? `https://sqs.${parsedArn.region}.${stack.urlSuffix}/${parsedArn.account}/${queueName}`;

    // Determine if FIFO based on name or explicit attribute
    let fifo: boolean;
    if (attrs.fifo !== undefined) {
      fifo = attrs.fifo;
    } else if (Token.isUnresolved(queueName)) {
      fifo = false;
    } else {
      fifo = queueName.endsWith('.fifo');
    }

    class Import extends Resource implements IQueue2 {
      public readonly queueArn = attrs.queueArn;
      public readonly queueUrl = queueUrl;
      public readonly queueName = queueName;
      public readonly fifo = fifo;
      public readonly encryptionMasterKey = undefined;
      public readonly encryptionType = undefined;
      public readonly grants = Queue2Grants.of(this);

      public get queueRef(): QueueReference {
        return {
          queueUrl: this.queueUrl,
          queueArn: this.queueArn,
        };
      }

      public addToResourcePolicy(_statement: iam.PolicyStatement): iam.AddToResourcePolicyResult {
        return { statementAdded: false };
      }
    }

    return new Import(scope, id, {
      environmentFromArn: attrs.queueArn,
    });
  }

  /**
   * The ARN of this queue
   */
  public readonly queueArn: string;

  /**
   * The URL of this queue
   */
  public readonly queueUrl: string;

  /**
   * The name of this queue
   */
  public readonly queueName: string;

  /**
   * If this queue is server-side encrypted, this is the KMS encryption key.
   */
  public readonly encryptionMasterKey?: kms.IKey;

  /**
   * Whether this queue is an Amazon SQS FIFO queue.
   */
  public readonly fifo: boolean;

  /**
   * Whether the contents of the queue are encrypted, and by what type of key.
   */
  public readonly encryptionType?: QueueEncryption;

  /**
   * Grant permissions on this queue
   */
  public readonly grants: Queue2Grants;

  /**
   * The underlying CfnQueue resource
   */
  private readonly resource: sqs.CfnQueue;

  /**
   * The queue policy (created lazily)
   */
  private policy?: sqs.CfnQueuePolicy;

  constructor(scope: Construct, id: string, props: Queue2Props = {}) {
    super(scope, id, {
      physicalName: props.queueName,
    });

    // Validate FIFO queue name
    const fifoQueue = props.fifo ?? false;
    if (fifoQueue && props.queueName && !props.queueName.endsWith('.fifo')) {
      throw new ValidationError('FIFO queue names must end in \'.fifo\'', this);
    }
    if (!fifoQueue && props.queueName?.endsWith('.fifo')) {
      throw new ValidationError('Queue names ending in \'.fifo\' are reserved for FIFO queues', this);
    }

    // Create the L1 resource
    this.resource = new sqs.CfnQueue(this, 'Resource');

    // Apply mixins
    Mixins.of(this).apply(
      new LifecycleMixin({
        queueName: props.queueName,
        removalPolicy: props.removalPolicy,
      }),
      new EncryptionMixin({
        encryption: props.encryption,
        encryptionMasterKey: props.encryptionMasterKey,
        dataKeyReuse: props.dataKeyReuse,
      }),
      new FifoMixin({
        fifo: fifoQueue,
        contentBasedDeduplication: props.contentBasedDeduplication,
        deduplicationScope: props.deduplicationScope,
        fifoThroughputLimit: props.fifoThroughputLimit,
      }),
      new MessageConfigurationMixin({
        retentionPeriod: props.retentionPeriod,
        deliveryDelay: props.deliveryDelay,
        maxMessageSizeBytes: props.maxMessageSizeBytes,
        visibilityTimeout: props.visibilityTimeout,
        receiveMessageWaitTime: props.receiveMessageWaitTime,
      }),
      new DeadLetterQueueMixin({
        deadLetterQueue: props.deadLetterQueue,
        redriveAllowPolicy: props.redriveAllowPolicy,
      }),
      new SecurityMixin({
        enforceSSL: props.enforceSSL,
      }),
      new TaggingMixin({
        tags: props.tags,
      }),
    );

    // Set instance properties
    this.queueArn = this.resource.attrArn;
    this.queueUrl = this.resource.attrQueueUrl;
    this.queueName = this.resource.attrQueueName;
    this.fifo = fifoQueue;
    this.encryptionMasterKey = props.encryptionMasterKey;
    this.encryptionType = props.encryption;
    this.grants = Queue2Grants.of(this);
  }

  /**
   * A reference to a Queue resource.
   */
  public get queueRef(): QueueReference {
    return {
      queueUrl: this.queueUrl,
      queueArn: this.queueArn,
    };
  }

  /**
   * Adds a statement to the IAM resource policy associated with this queue.
   *
   * If this queue was created in this stack, a queue policy will be
   * automatically created upon the first call to `addToResourcePolicy`.
   */
  public addToResourcePolicy(statement: iam.PolicyStatement): iam.AddToResourcePolicyResult {
    if (!this.policy) {
      this.policy = new sqs.CfnQueuePolicy(this, 'Policy', {
        queues: [this.queueUrl],
        policyDocument: new iam.PolicyDocument().toJSON(),
      });
    }

    // Get the policy document and add the statement
    const policyDoc = new iam.PolicyDocument();
    policyDoc.addStatements(statement);

    // Update the policy document
    this.policy.policyDocument = policyDoc.toJSON();

    return { statementAdded: true, policyDependable: this.policy };
  }
}
