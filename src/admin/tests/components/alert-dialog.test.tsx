import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';

describe('AlertDialog', () => {
  it('opens when trigger is clicked', async () => {
    const user = userEvent.setup();

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to proceed?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    // Dialog should not be visible initially
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();

    // Click trigger to open
    await user.click(screen.getByText('Open Dialog'));

    // Dialog should now be visible
    await waitFor(() => {
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('closes when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm</AlertDialogTitle>
            <AlertDialogDescription>Please confirm your choice.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    // Open dialog
    await user.click(screen.getByText('Open Dialog'));
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });

    // Click cancel
    await user.click(screen.getByText('Cancel'));

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    });
  });

  it('calls action handler when action is clicked', async () => {
    const user = userEvent.setup();
    const handleAction = vi.fn();

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open Dialog</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    // Open dialog
    await user.click(screen.getByText('Open Dialog'));
    await waitFor(() => {
      expect(screen.getByText('Delete Item')).toBeInTheDocument();
    });

    // Click action
    await user.click(screen.getByText('Delete'));

    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('can be controlled externally', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Controlled Dialog</AlertDialogTitle>
            <AlertDialogDescription>Controlled dialog description.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    // Dialog should be visible (controlled open=true)
    expect(screen.getByText('Controlled Dialog')).toBeInTheDocument();

    // Click cancel
    await user.click(screen.getByText('Cancel'));

    // onOpenChange should be called with false
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('applies correct styles to action button', async () => {
    const user = userEvent.setup();

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogDescription>Action button styling test.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="action">Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      const action = screen.getByTestId('action');
      // Action button should have button styles
      expect(action).toHaveClass('inline-flex', 'items-center');
    });
  });

  it('applies correct styles to cancel button', async () => {
    const user = userEvent.setup();

    render(
      <AlertDialog>
        <AlertDialogTrigger>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogDescription>Cancel button styling test.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      const cancel = screen.getByTestId('cancel');
      // Cancel button should have outline variant styles
      expect(cancel).toHaveClass('border');
    });
  });
});
