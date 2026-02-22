type ReplyToValue = string | {
    name: string;
    address: string;
};
export declare function extractReplyToFromSubmission(body: Record<string, unknown>): ReplyToValue | undefined;
export {};
