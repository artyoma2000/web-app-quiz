import requests, json
base='http://127.0.0.1:8000/api'
payload={'question_text':'Test save?','correct_answer':'A','options':['A','B','C','D'],'quest_id':1}
try:
    r=requests.post(base+'/admin/question', json=payload, auth=('admin','admin'))
    print('POST STATUS', r.status_code)
    print(r.text)
except Exception as e:
    print('POST ERR', e)

try:
    r=requests.get(base+'/admin/questions', auth=('admin','admin'))
    print('\nGET STATUS', r.status_code)
    print(r.text[:1000])
except Exception as e:
    print('GET ERR', e)
