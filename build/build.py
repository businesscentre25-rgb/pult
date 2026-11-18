import sys,re
src,shim,out,api=sys.argv[1:5]
h=open(src).read(); s=open(shim).read().replace("__API_URL__",api)
head='''<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Пульт">
<meta name="theme-color" content="#0d0a0e">
<meta name="robots" content="noindex,nofollow">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
'''
h=h.replace('<meta name="viewport" content="width=device-width, initial-scale=1">','<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'+head,1)
h=h.replace('<title>Пульт AI-штаба</title>','<title>Пульт</title>',1)
i=h.index('<script>'); h=h[:i]+s+'\n'+h[i:]
h=h.replace('Открой пульт в Claude, войдя в свой аккаунт.','Проверь интернет и нажми «Обновить».')
h=h.replace('Живые данные доступны только при открытии пульта в Claude','Нет связи с таблицей')
assert h.count('window.claude={use')==1
open(out,'w').write(h); print('ok',len(h))
