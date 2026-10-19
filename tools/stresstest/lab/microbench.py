"""CPU-only cost of the current duplicate scan; no game state is mutated."""
import json
import time
import uuid
from classquiz.db.models import AnswerData, AnswerDataList, PlayGame

out = {}
for users in (100,300,1000):
    rows = [AnswerData(username=f'p{i}', answer='A',right=True,time_taken=100,score=900).model_dump_json() for i in range(users)]
    at = time.process_time()
    for i in range(users):
        parsed = AnswerDataList([AnswerData.model_validate_json(row) for row in rows[:i]])
        list(filter(lambda a:a.username==f'p{i}',parsed.root))
    out[str(users)] = dict(serial_round_scan_cpu_ms=(time.process_time()-at)*1000,
                           parsed_rows=users*(users-1)//2)
for question_count in (10,100):
    game = dict(quiz_id=str(uuid.uuid4()),user_id=str(uuid.uuid4()),game_id=str(uuid.uuid4()),
        game_pin='123456',title='microbench',description='',questions=[dict(question='Question',time='30',
        answers=[dict(answer=x,right=x=='A') for x in 'ABCD']) for _ in range(question_count)])
    encoded = json.dumps(game)
    at = time.process_time()
    for _ in range(1000):
        PlayGame.model_validate_json(encoded)
    out[f'parse_quiz_{question_count}q'] = dict(cpu_ms_1000_loads=(time.process_time()-at)*1000,bytes=len(encoded))
print(json.dumps(out,indent=2))
