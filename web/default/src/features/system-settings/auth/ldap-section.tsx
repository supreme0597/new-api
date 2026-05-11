import { useMemo, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'

const ldapSchema = z.object({
  'ldap.enabled': z.boolean(),
  'ldap.url': z.string(),
  'ldap.user': z.string(),
  'ldap.password': z.string(),
  'ldap.type': z.string(),
  'ldap.sc': z.string(),
  'ldap.ldaps': z.boolean(),
  'ldap.skip_tls': z.boolean(),
  'ldap.map': z.string(),
  'ldap.test_user': z.string(),
  'ldap.test_pass': z.string(),
  'ldap.allowed_groups': z.string(),
  'ldap.group_attribute': z.string(),
})

type LDAPFormValues = z.infer<typeof ldapSchema>

interface LDAPSectionProps {
  defaultValues: LDAPFormValues
}

export function LDAPSection({ defaultValues }: LDAPSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [isTesting, setIsTesting] = useState(false)

  const formDefaults = useMemo<LDAPFormValues>(
    () => ({
      ...defaultValues,
    }),
    [defaultValues]
  )

  const form = useForm<LDAPFormValues>({
    resolver: zodResolver(ldapSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  const ldapEnabled = form.watch('ldap.enabled')

  const onSubmit = async (data: LDAPFormValues) => {
    const updates: Array<{ key: string; value: string | boolean }> = []

    Object.entries(data).forEach(([key, value]) => {
      if (value !== defaultValues[key as keyof LDAPFormValues]) {
        updates.push({ key, value })
      }
    })

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    try {
      const res = await api.post('/api/ldap/test')
      const { success, message } = res.data
      if (success) {
        toast.success(t('LDAP connection test successful'))
      } else {
        toast.error(message || t('LDAP connection test failed'))
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : String(error)
      toast.error(t('LDAP connection test failed') + ': ' + msg)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <SettingsSection
      title={t('LDAP Authentication')}
      description={t(
        'Configure LDAP/Active Directory authentication for enterprise users'
      )}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          {/* Enable LDAP */}
          <FormField
            control={form.control}
            name='ldap.enabled'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                <div className='space-y-0.5'>
                  <FormLabel className='text-base'>
                    {t('Enable LDAP Authentication')}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      'Allow users to authenticate via LDAP/Active Directory'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {ldapEnabled && (
            <>
              {/* Server URL & Base DN */}
              <div className='grid gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='ldap.url'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('LDAP Server Address')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='ldap.example.com:389'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Format: host:port')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='ldap.sc'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Base DN')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='dc=example,dc=com'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Search base DN')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Admin DN & Password */}
              <div className='grid gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='ldap.user'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Admin DN')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='cn=admin,dc=example,dc=com'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Admin account for LDAP binding')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='ldap.password'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Admin Password')}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder='••••••••'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Password for the admin account')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Search Filter & Attribute Mapping */}
              <div className='grid gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='ldap.type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Search Filter')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='(employeeID=%s)'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'User search filter, %s will be replaced by employee ID. For AD use (sAMAccountName=%s)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='ldap.group_attribute'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Group Attribute')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='memberOf'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'LDAP attribute name for user group membership'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Attribute Mapping */}
              <FormField
                control={form.control}
                name='ldap.map'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Attribute Mapping')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder='{"real_name":"cn","email":"mail","department":"department"}'
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'JSON format, defines LDAP attribute to system field mapping'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Allowed Groups */}
              <FormField
                control={form.control}
                name='ldap.allowed_groups'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Allowed Groups')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='group1,group2,group3'
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Comma-separated list of allowed LDAP groups. Leave empty to allow all groups.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* LDAPS & Skip TLS */}
              <div className='grid gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='ldap.ldaps'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-base'>
                          {t('Enable LDAPS')}
                        </FormLabel>
                        <FormDescription>
                          {t('Use LDAPS (LDAP over SSL)')}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='ldap.skip_tls'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-base'>
                          {t('Skip TLS Verification')}
                        </FormLabel>
                        <FormDescription>
                          {t(
                            'Skip TLS certificate verification (not recommended for production)'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Test User & Password */}
              <div className='grid gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='ldap.test_user'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Test User')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='test'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Employee ID for testing LDAP connection')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='ldap.test_pass'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Test Password')}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder='••••••••'
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Password for the test user')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}

          {/* Save & Test Buttons */}
          <div className='flex gap-3'>
            <Button type='submit' disabled={updateOption.isPending}>
              {updateOption.isPending ? t('Saving...') : t('Save Changes')}
            </Button>
            {ldapEnabled && (
              <Button
                type='button'
                variant='outline'
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : null}
                {t('Test Connection')}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </SettingsSection>
  )
}
