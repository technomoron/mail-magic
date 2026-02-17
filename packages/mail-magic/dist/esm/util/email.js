import emailAddresses from 'email-addresses';
export function validateEmail(email) {
    const parsed = emailAddresses.parseOneAddress(email);
    if (parsed) {
        return parsed.address;
    }
    return undefined;
}
export function parseMailbox(value) {
    const parsed = emailAddresses.parseOneAddress(value);
    if (!parsed) {
        return undefined;
    }
    const mailbox = parsed;
    if (!mailbox?.address) {
        return undefined;
    }
    return mailbox;
}
