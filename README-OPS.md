# RitaOps — операционный дашборд

**Домен:** https://ritaops.com

## Роли

| URL | Кто | Назначение |
|-----|-----|------------|
| `/portal/[slug]?token=…` | Организатор группы | Заполнение рейсов, меню, активностей |
| `/dashboard` | Персонал RitaOps | Список всех групп (карточки) |
| `/ops/group?slug=…` | Персонал RitaOps | Карточка группы по макету (прогресс, секции) |

Las Canas — первый объект (`property: Las Canas Beach Retreat`). Данные в Sanity `groupPortal`.

## Netlify env

- `SANITY_API_READ_TOKEN` — токен с read + write (для POST портала организатора)
- `DASHBOARD_SECRET` — (рекомендуется) ключ staff: `?key=…` в URL дашборда

Без `DASHBOARD_SECRET` API отдаёт список без ссылок организатору.

## Staff доступ

```
https://ritaops.com/dashboard?key=ВАШ_СЕКРЕТ
```

Ключ сохраняется в `sessionStorage` для переходов между страницами.

## Деплой

```bash
cd ~/ritaops-site
git add . && git commit -m "RitaOps ops dashboard" && git push
```

Netlify подхватит functions и redirects автоматически.
