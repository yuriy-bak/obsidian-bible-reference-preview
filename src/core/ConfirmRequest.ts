/** A yes/no question to the user; services ask it through a function the plugin gives them, so they need no UI code. */
export type ConfirmRequest = {
    title: string;
    messageLines: string[];
    confirmText: string;
    cancelText: string;
};

export type Confirm = (request: ConfirmRequest) => Promise<boolean>;
