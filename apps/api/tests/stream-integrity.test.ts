import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe,expect,it } from "vitest";
import { hashReadable,StreamIntegrityError } from "../src/storage/stream-integrity.js";

function generated(size:number,mutateAt=-1){let offset=0;return new Readable({highWaterMark:64*1024,read(requested){if(offset>=size)return this.push(null);const length=Math.min(requested,size-offset);const chunk=Buffer.alloc(length,0x5a);if(mutateAt>=offset&&mutateAt<offset+length)chunk[mutateAt-offset]=0x21;offset+=length;this.push(chunk);}});}

describe("streaming integrity core",()=>{
  it("hashes a file near 260 MiB with bounded heap and no temporary disk",async()=>{
    const size=260*1024*1024;
    const before=process.memoryUsage().heapUsed;
    const result=await hashReadable(generated(size),{maxBytes:size,timeoutMs:60_000});
    const after=process.memoryUsage().heapUsed;
    const expected=createHash("sha256");for(let remaining=size;remaining>0;remaining-=Math.min(1024*1024,remaining))expected.update(Buffer.alloc(Math.min(1024*1024,remaining),0x5a));
    expect(result).toEqual({sizeBytes:size,checksumSha256:expected.digest("hex")});
    expect(after-before).toBeLessThan(32*1024*1024);
  },90_000);

  it("detects changed and truncated streams by their full hash and size",async()=>{
    const original=await hashReadable(generated(2*1024*1024),{maxBytes:3*1024*1024,timeoutMs:10_000});
    const changed=await hashReadable(generated(2*1024*1024,1_000_000),{maxBytes:3*1024*1024,timeoutMs:10_000});
    const truncated=await hashReadable(generated(1024),{maxBytes:3*1024*1024,timeoutMs:10_000});
    expect(changed.checksumSha256).not.toBe(original.checksumSha256);
    expect(truncated.sizeBytes).not.toBe(original.sizeBytes);
  });

  it("stops interrupted and oversized streams with sanitized errors",async()=>{
    const interrupted=new Readable({read(){this.destroy(new Error("private detail"));}});
    await expect(hashReadable(interrupted,{maxBytes:1024,timeoutMs:1000})).rejects.toEqual(new StreamIntegrityError("stream_interrupted"));
    await expect(hashReadable(generated(2048),{maxBytes:1024,timeoutMs:1000})).rejects.toEqual(new StreamIntegrityError("size_limit_exceeded"));
    const stalled=new Readable({read(){}});
    await expect(hashReadable(stalled,{maxBytes:1024,timeoutMs:20})).rejects.toEqual(new StreamIntegrityError("verification_timeout"));
  });
});
