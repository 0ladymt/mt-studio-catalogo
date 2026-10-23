export type TransactionalEmailJob={id:string;event_key:string;recipient_email:string;template:"payment_confirmed";payload:Record<string,unknown>;attempts:number};
export interface EmailDelivery{claim(workerId:string):Promise<TransactionalEmailJob|null>;send(job:TransactionalEmailJob):Promise<void>;complete(id:string,workerId:string,success:boolean,error?:string):Promise<void>}
