import json,http.server
PW="test123"; DB={"items":[{"id":"d1","data":{"kind":"decide","title":"Тест решение","text":"x","order":1}}],"cash":[]}
FIX={"'Доставки'!A2:A3000":[["Получен"],["Новый"]],"'Доставки'!D2:H3000":[["1001","16.11.2026","Rozetka","500",""],["1002","17.11.2026","Сайт","300",""]],
"'3. Продажи'!A5:A4000":[["16.11.26"]],"'3. Продажи'!C5:C4000":[["Rozetka"]],"'3. Продажи'!B5:B4000":[["Панч спорт беж"]],"'3. Продажи'!G5:K4000":[[500,50,0,70,380]],
"'5. Опексы'!A5:D1500":[["01.11.26","Реклама","FB",1000]],"'6. Возвраты'!A5:A3000":[],"'6. Возвраты'!I5:I3000":[],"'7. Остатки'!A5:M60":[],"'2. SKU'!A5:G60":[]}
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory="site",**k)
    def do_POST(s):
        b=json.loads(s.rfile.read(int(s.headers['Content-Length'])))
        if b.get("pw")!=PW: r={"ok":False,"code":"bad_password"}
        elif b["op"]=="ping": r={"ok":True}
        elif b["op"]=="read": r={"ok":True,"data":{a:{"ok":True,"values":FIX.get(a,[])} for a in b["ranges"]}}
        elif b["op"]=="list": r={"ok":True,"docs":DB[b["collection"]]}
        elif b["op"] in("set","update"):
            L=DB[b["collection"]]; e=[d for d in L if d["id"]==b["id"]]
            if e: e[0]["data"]=({**e[0]["data"],**b["data"]} if b["op"]=="update" else b["data"])
            else: L.append({"id":b["id"],"data":b["data"]})
            r={"ok":True}
        elif b["op"]=="delete": DB[b["collection"]][:]=[d for d in DB[b["collection"]] if d["id"]!=b["id"]]; r={"ok":True}
        s.send_response(200); s.send_header("Content-Type","application/json"); s.send_header("Access-Control-Allow-Origin","*"); s.end_headers(); s.wfile.write(json.dumps(r).encode())
    def log_message(s,*a): pass
http.server.ThreadingHTTPServer(("127.0.0.1",8765),H).serve_forever()
