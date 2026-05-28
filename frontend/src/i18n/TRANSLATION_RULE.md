# Regra de Tradução — Go Help Desk

## Regra Obrigatória para Novas Features

> **Toda string de interface do usuário (UI) DEVE ter entrada no arquivo de traduções.**

---

## Como Adicionar Strings de uma Nova Feature

1. **Abra** `src/i18n/translations.ts`
2. **Adicione** suas chaves seguindo o padrão de namespace:

```ts
// Use namespace descritivo: 'módulo.chave'
'minha_feature.titulo':      { pt: 'Meu Título',     en: 'My Title' },
'minha_feature.descricao':   { pt: 'Minha descrição', en: 'My description' },
```

3. **Use** o hook `useT()` no componente:

```tsx
import { useT } from '@/i18n'

function MinhaFeature() {
  const { t } = useT()
  return <h1>{t('minha_feature.titulo')}</h1>
}
```

---

## Garantia Automática via TypeScript

O arquivo `translations.ts` usa `satisfies Record<string, Record<Lang, string>>`.  
Se você adicionar uma chave para `pt` mas esquecer o `en` (ou vice-versa), o **TypeScript recusará o build** com um erro claro.

Exemplo de erro ao esquecer `en`:
```
Type '{ pt: string }' is not assignable to type 'Record<Lang, string>'.
  Property 'en' is missing in type '{ pt: string }'.
```

---

## Namespaces Existentes

| Namespace | Uso |
|---|---|
| `nav.*` | Labels de navegação da sidebar |
| `auth.*` | Textos da tela de login / MFA |
| `dashboard.*` | Dashboard do usuário |
| `ticket.*` | Formulário e listagem de tickets |
| `itsm.*` | Tipos de ticket ITSM |
| `common.*` | Strings genéricas (Salvar, Cancelar, Erro…) |

---

## Padrão de Nomeação de Chaves

- Use letras minúsculas com underscores: `ticket.priority_high`
- Prefixe com o módulo/página: `admin_users.invite_button`
- Sufixo para estados variantes: `.loading`, `.placeholder`, `.title`, `.error`
