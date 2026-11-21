import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiError } from '../api/client'
import { WelcomePage } from '../pages/WelcomePage'

const join = vi.fn()
vi.mock('../services/gameController', () => ({
  controller: { join: (...args: unknown[]) => join(...args) },
}))

// Braces matter: returning the mock from a hook makes vitest call it as a cleanup callback.
beforeEach(() => {
  join.mockReset()
})

/** Reject lazily, at call time (an eagerly-built rejected promise is flagged unhandled while the test awaits typing). */
const rejectWith = (error: Error) => join.mockImplementation(() => Promise.reject(error))

const nameInput = () => screen.getByLabelText('Username')
const submit = () => screen.getByRole('button', { name: /join grid|joining/i })

describe('WelcomePage', () => {
  it('shows the logo, explanation, username field, colour selector and Join button', () => {
    render(<WelcomePage />)
    expect(screen.getAllByText(/GridWars/).length).toBeGreaterThan(0)
    expect(screen.getByText(/exactly one of you gets it/i)).toBeInTheDocument()
    expect(nameInput()).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(8)
    expect(submit()).toBeEnabled()
  })

  it('validates the username locally and does not call the API', async () => {
    const user = userEvent.setup()
    render(<WelcomePage />)
    await user.click(submit())
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a username.')
    await user.type(nameInput(), 'ab')
    await user.click(submit())
    expect(screen.getByRole('alert')).toHaveTextContent(/3–20 characters/)
    expect(join).not.toHaveBeenCalled()
  })

  it('submits the trimmed username and the selected colour', async () => {
    const user = userEvent.setup()
    join.mockResolvedValue(undefined)
    render(<WelcomePage />)
    await user.type(nameInput(), 'Saurabh')
    await user.click(screen.getByRole('radio', { name: 'Color #34D399' }))
    expect(screen.getByRole('radio', { name: 'Color #34D399' })).toBeChecked()
    await user.click(submit())
    expect(join).toHaveBeenCalledExactlyOnceWith('Saurabh', '#34D399')
  })

  it('lets the user pick a custom colour', async () => {
    const user = userEvent.setup()
    join.mockResolvedValue(undefined)
    const { container } = render(<WelcomePage />)
    await user.type(nameInput(), 'Custom_1')
    fireEvent.change(container.querySelector('input[type="color"]')!, { target: { value: '#12ab34' } })
    await user.click(submit())
    expect(join).toHaveBeenCalledWith('Custom_1', '#12AB34')
  })

  it('disables the button and shows progress while joining', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    join.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    render(<WelcomePage />)
    await user.type(nameInput(), 'Slowpoke')
    await user.click(submit())
    expect(screen.getByRole('button', { name: /joining/i })).toBeDisabled()
    resolve()
  })

  it('shows "username taken" from the server under the username field and re-enables the form', async () => {
    const user = userEvent.setup()
    rejectWith(new ApiError(409, 'username_taken', 'That username is already taken.'))
    render(<WelcomePage />)
    await user.type(nameInput(), 'Neo')
    await user.click(submit())
    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument()
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(submit()).toBeEnabled()
  })

  it('shows server-side validation messages (e.g. disallowed names)', async () => {
    const user = userEvent.setup()
    rejectWith(new ApiError(400, 'validation_error', 'invalid', { username: ['That username is reserved.'] }))
    render(<WelcomePage />)
    await user.type(nameInput(), 'admin')
    await user.click(submit())
    expect(await screen.findByText('That username is reserved.')).toBeInTheDocument()
  })

  it('shows a rate-limit message with the wait time', async () => {
    const user = userEvent.setup()
    rejectWith(new ApiError(429, 'throttled', 'Request was throttled.', { retry_after_seconds: 42 }))
    render(<WelcomePage />)
    await user.type(nameInput(), 'Eager_1')
    await user.click(submit())
    expect(await screen.findByText(/Too many attempts.*42 seconds/)).toBeInTheDocument()
  })

  it('shows a network failure and lets the user retry', async () => {
    const user = userEvent.setup()
    join.mockImplementationOnce(() => Promise.reject(new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.')))
    join.mockResolvedValueOnce(undefined)
    render(<WelcomePage />)
    await user.type(nameInput(), 'Offline1')
    await user.click(submit())
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument()
    await user.click(submit())
    await waitFor(() => expect(join).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/Cannot reach the server/)).not.toBeInTheDocument())
  })
})
