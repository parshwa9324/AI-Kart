import sys

new_block = '''if __name__ == '__main__':
    from rq import Connection
    from rq.job import Job
    from job_queue import HIGH_QUEUE, DEFAULT_QUEUE, LOW_QUEUE
    import time
    import traceback
    
    with Connection(r):
        print(f"[AI-Kart Worker] Starting Windows-compatible synchronous polling loop...")
        print(f"[AI-Kart Worker] Listening on queues: {HIGH_QUEUE}, {DEFAULT_QUEUE}, {LOW_QUEUE}")
        
        while True:
            job_found = False
            for queue_name in [HIGH_QUEUE, DEFAULT_QUEUE, LOW_QUEUE]:
                job_id = r.lpop(f"rq:queue:{queue_name}")
                if job_id:
                    job_found = True
                    job_id_str = job_id.decode('utf-8') if isinstance(job_id, bytes) else job_id
                    print(f"Executing job {job_id_str} from {queue_name}...")
                    try:
                        job = Job.fetch(job_id_str, connection=r)
                        job.perform()
                    except Exception as e:
                        print(f"Error performing job {job_id_str}:\\n{traceback.format_exc()}")
                    break
            
            if not job_found:
                time.sleep(2)
'''

with open('worker.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('worker.py', 'w', encoding='utf-8') as f:
    for line in lines[:257]:
        f.write(line)
    f.write('\\n' + new_block)
print('Patched worker.py!')
